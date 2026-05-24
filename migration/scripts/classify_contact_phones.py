#!/usr/bin/env python3
"""
Phase 5c — classify owner phone fields from legacy XLSX and emit phase5c_contact_cleanup.sql.

Usage (Samer runs locally):
  pip install pandas openpyxl
  python migration/scripts/classify_contact_phones.py \
    --xlsx outputs/woof_migration/WOOF_System_Migration_Simple.xlsx \
    --out sql/phase5/phase5c_contact_cleanup.sql

Reads Owners sheet (or first sheet with OwnerUID + ContactNumber), classifies rows, writes INSERTs
into a temp staging table consumed by sql/phase5/phase5c_contact_cleanup.sql template.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd

VET_KEYWORDS = re.compile(
    r"\b(vet|veterinary|clinic|hospital|animal)\b",
    re.I,
)
PHONE_DIGITS = re.compile(r"\d{7,}")
WHATSAPP_PREFIX = re.compile(r"^whatsapp\s*\+?", re.I)


def extract_phones(text: str) -> list[str]:
    """Pull digit runs that look like UAE/mobile numbers."""
    parts = re.split(r"[/|,;]", text)
    out: list[str] = []
    for part in parts:
        digits = re.sub(r"\D", "", part)
        if len(digits) >= 7:
            out.append(digits)
    return out


def classify_row(
    owner_uid: str,
    contact: str,
    first_name: str,
) -> dict[str, str | None]:
    raw = (contact or "").strip()
    if not raw:
        return {
            "owner_source_external_id": owner_uid,
            "cleaned_phone": None,
            "secondary_phone": None,
            "secondary_contact_name": None,
            "vet_clinic_name": None,
            "vet_clinic_phone": None,
            "channel_note": None,
            "classification": "empty",
        }

    channel_note = None
    if WHATSAPP_PREFIX.search(raw):
        channel_note = f"Legacy contact channel: {raw[:80]}"
        raw = WHATSAPP_PREFIX.sub("", raw).strip()

    # Vet with embedded phone: "ABVC Vet 043408601"
    if VET_KEYWORDS.search(raw) or (re.search(r"[A-Za-z]{3}", raw) and PHONE_DIGITS.search(raw)):
        phones = extract_phones(raw)
        name = re.sub(PHONE_DIGITS, "", raw).strip(" -–—,")
        if phones and name:
            return {
                "owner_source_external_id": owner_uid,
                "cleaned_phone": None,
                "secondary_phone": None,
                "secondary_contact_name": None,
                "vet_clinic_name": name[:200] or None,
                "vet_clinic_phone": phones[0],
                "channel_note": channel_note,
                "classification": "vet_with_phone",
            }
        if name and not phones:
            return {
                "owner_source_external_id": owner_uid,
                "cleaned_phone": None,
                "secondary_phone": None,
                "secondary_contact_name": None,
                "vet_clinic_name": name[:200],
                "vet_clinic_phone": None,
                "channel_note": channel_note,
                "classification": "vet_name_only",
            }

    # Multi-phone (slash)
    if "/" in raw:
        segments = [s.strip() for s in raw.split("/") if s.strip()]
        primary_seg = segments[0]
        secondary_seg = segments[1] if len(segments) > 1 else ""
        fn = (first_name or "").strip().lower()
        if fn and primary_seg.lower().startswith(fn):
            primary_seg = primary_seg[len(first_name) :].strip()
        primary_phones = extract_phones(primary_seg)
        secondary_name = None
        secondary_phones: list[str] = []
        if secondary_seg:
            name_match = re.match(r"^([A-Za-z][A-Za-z\s'-]{0,40})\s+(\d.*)$", secondary_seg)
            if name_match:
                secondary_name = name_match.group(1).strip()
                secondary_phones = extract_phones(name_match.group(2))
            else:
                secondary_phones = extract_phones(secondary_seg)
        return {
            "owner_source_external_id": owner_uid,
            "cleaned_phone": primary_phones[0] if primary_phones else None,
            "secondary_phone": secondary_phones[0] if secondary_phones else None,
            "secondary_contact_name": secondary_name,
            "vet_clinic_name": None,
            "vet_clinic_phone": None,
            "channel_note": channel_note,
            "classification": "multi_phone",
        }

    # Self name prefix: "Yasmine 050 886 1108"
    fn = (first_name or "").strip()
    if fn and raw.lower().startswith(fn.lower()):
        rest = raw[len(fn) :].strip()
        phones = extract_phones(rest)
        return {
            "owner_source_external_id": owner_uid,
            "cleaned_phone": phones[0] if phones else None,
            "secondary_phone": None,
            "secondary_contact_name": None,
            "vet_clinic_name": None,
            "vet_clinic_phone": None,
            "channel_note": channel_note,
            "classification": "self_name_prefix",
        }

    phones = extract_phones(raw)
    if phones and re.search(r"[A-Za-z]{4}", raw) and not VET_KEYWORDS.search(raw):
        # Text + digits but not clearly vet — flag for manual review in notes
        channel_note = (channel_note or "") + f" | Unparsed contact: {raw[:120]}"

    return {
        "owner_source_external_id": owner_uid,
        "cleaned_phone": phones[0] if phones else re.sub(r"\D", "", raw) or None,
        "secondary_phone": None,
        "secondary_contact_name": None,
        "vet_clinic_name": None,
        "vet_clinic_phone": None,
        "channel_note": channel_note.strip(" |") if channel_note else None,
        "classification": "simple",
    }


def sql_escape(val: str | None) -> str:
    if val is None:
        return "NULL"
    return "'" + val.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sheet", default="Owners")
    args = parser.parse_args()

    df = pd.read_excel(args.xlsx, sheet_name=args.sheet)
    col_map = {c.lower().replace(" ", "_"): c for c in df.columns}
    uid_col = col_map.get("owneruid") or col_map.get("owner_uid") or col_map.get("clientuid")
    phone_col = col_map.get("contactnumber") or col_map.get("phone") or col_map.get("contact_number")
    fn_col = col_map.get("ownerfirstname") or col_map.get("first_name")

    if not uid_col or not phone_col:
        raise SystemExit(f"Could not find OwnerUID / ContactNumber columns in {list(df.columns)}")

    rows: list[dict] = []
    for _, r in df.iterrows():
        uid = str(r[uid_col]).strip()
        if not uid or uid.lower() == "nan":
            continue
        contact = "" if pd.isna(r[phone_col]) else str(r[phone_col])
        fn = "" if fn_col is None or pd.isna(r[fn_col]) else str(r[fn_col])
        if not contact.strip():
            continue
        if re.search(r"[A-Za-z]", contact) or "/" in contact:
            rows.append(classify_row(uid, contact, fn))

    lines = [
        "-- Generated by migration/scripts/classify_contact_phones.py",
        "-- Review classifications before running in Supabase.",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE _contact_stage (",
        "  owner_source_external_id text PRIMARY KEY,",
        "  cleaned_phone            text,",
        "  secondary_phone          text,",
        "  secondary_contact_name   text,",
        "  vet_clinic_name          text,",
        "  vet_clinic_phone         text,",
        "  channel_note             text",
        ") ON COMMIT DROP;",
        "",
    ]

    for row in rows:
        lines.append(
            "INSERT INTO _contact_stage VALUES ("
            f"{sql_escape(row['owner_source_external_id'])}, "
            f"{sql_escape(row.get('cleaned_phone'))}, "
            f"{sql_escape(row.get('secondary_phone'))}, "
            f"{sql_escape(row.get('secondary_contact_name'))}, "
            f"{sql_escape(row.get('vet_clinic_name'))}, "
            f"{sql_escape(row.get('vet_clinic_phone'))}, "
            f"{sql_escape(row.get('channel_note'))}"
            ");"
        )

    lines.extend(
        [
            "",
            "-- Apply using owners.phone, owners.phone2, owners.vet_name, owners.vet_phone (no vet_clinic_id FK).",
            "-- See sql/phase5/phase5c_contact_cleanup.sql for the UPDATE block.",
            "",
            f"-- Staged {len(rows)} owner rows",
            "COMMIT;",
        ]
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(rows)} staged rows to {args.out}")


if __name__ == "__main__":
    main()
