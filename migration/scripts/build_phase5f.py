"""
WOOF Phase 5f — Recover daycare sessions dropped by strict Phase 4c date parsing.

Reads the patched migration XLSX, re-parses UsageDateRaw with the smart parser,
and emits sql/phase5/phase5f_recover_daycare_sessions.sql for the Supabase SQL editor.

Only rows where the strict parser (ISO at string start) fails but the smart parser
succeeds are staged — sessions already imported by Phase 4c are skipped.

Usage:
  python migration/scripts/build_phase5f.py
  python migration/scripts/build_phase5f.py --xlsx /path/to/WOOF_System_Migration_Simple_PATCHED.xlsx
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XLSX = "/mnt/user-data/outputs/WOOF_System_Migration_Simple_PATCHED.xlsx"
OUT_SQL = REPO_ROOT / "sql" / "phase5" / "phase5f_recover_daycare_sessions.sql"

_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}
_MONTH_FIRST = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*[-\s]?\s*(\d{1,2})\b",
    re.I,
)
_DAY_FIRST = re.compile(
    r"\b(\d{1,2})\s*[-\s]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b",
    re.I,
)
_ISO_ANYWHERE = re.compile(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})")
_DDMMYY = re.compile(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b")


def q(v: object) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "NULL"
    s = str(v).strip()
    if not s:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def qd(iso_date: str) -> str:
    return f"'{iso_date}'::date"


def chunk(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def split_pet_uids(s: object) -> list[str]:
    if pd.isna(s):
        return []
    return [p.strip() for p in re.split(r"\s*/\s*|\s*;\s*|\s*,\s*", str(s)) if p.strip()]


def parse_purchase_to_ts(s: object):
    if pd.isna(s):
        return None
    try:
        ts = pd.to_datetime(str(s).strip(), errors="coerce", dayfirst=False)
        if pd.notna(ts):
            return ts
    except Exception:
        pass
    m_year = re.search(r"\b(20\d{2})\b", str(s))
    if not m_year:
        return None
    m = _MONTH_FIRST.search(str(s)) or _DAY_FIRST.search(str(s))
    if not m:
        return None
    g = m.groups()
    try:
        if g[0].isdigit():
            day, mon_name = int(g[0]), g[1]
        else:
            mon_name, day = g[0], int(g[1])
        mon = _MONTHS.get(mon_name.lower()) or _MONTHS.get(mon_name.lower()[:3])
        return pd.Timestamp(year=int(m_year.group(1)), month=mon, day=day)
    except Exception:
        return None


def parse_strict_iso_start(raw: object) -> str | None:
    if pd.isna(raw):
        return None
    s = str(raw).strip()
    if not s:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        try:
            return pd.Timestamp(s).strftime("%Y-%m-%d")
        except Exception:
            return None
    return None


def is_multi_date_raw(raw: str) -> bool:
    if len(_ISO_ANYWHERE.findall(raw)) >= 2:
        return True
    if re.search(r"\s/\s*", raw) and (_MONTH_FIRST.search(raw) or _DAY_FIRST.search(raw)):
        return True
    if re.search(r"\s+and\s+", raw, re.I) and (_MONTH_FIRST.search(raw) or _ISO_ANYWHERE.search(raw)):
        return True
    return False


def parse_usage_date_smart(raw: object, purchase_ts, tracker_id: str) -> tuple[str | None, str | None]:
    """Return (iso_date, parse_method) or (None, None)."""
    if pd.isna(raw):
        return None, None
    s = str(raw).strip()
    if not s or s.upper() == "EPC":
        return None, None

    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        try:
            return pd.Timestamp(s).strftime("%Y-%m-%d"), "iso_start"
        except Exception:
            pass

    m = _ISO_ANYWHERE.search(s)
    if m:
        try:
            d = pd.Timestamp(year=int(m.group(1)), month=int(m.group(2)), day=int(m.group(3))).strftime(
                "%Y-%m-%d"
            )
            return d, "iso_anywhere"
        except Exception:
            pass

    m = _DDMMYY.search(s)
    if m:
        try:
            day, mon, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if yr < 100:
                yr += 2000
            return pd.Timestamp(year=yr, month=mon, day=day).strftime("%Y-%m-%d"), "ddmmyy"
        except Exception:
            pass

    md = None
    m = _MONTH_FIRST.search(s)
    if m:
        mon = _MONTHS.get(m.group(1).lower()) or _MONTHS.get(m.group(1).lower()[:3])
        day = int(m.group(2))
        if mon and 1 <= day <= 31:
            md = (mon, day)
    if md is None:
        m = _DAY_FIRST.search(s)
        if m:
            day = int(m.group(1))
            mon = _MONTHS.get(m.group(2).lower()) or _MONTHS.get(m.group(2).lower()[:3])
            if mon and 1 <= day <= 31:
                md = (mon, day)
    if md is None or purchase_ts is None:
        return None, None

    candidates = []
    for y in (purchase_ts.year, purchase_ts.year + 1, purchase_ts.year - 1):
        try:
            d = pd.Timestamp(year=y, month=md[0], day=md[1])
        except Exception:
            continue
        delta = (d - purchase_ts).days
        if -7 <= delta <= 400:
            candidates.append((d, abs(delta)))
    if not candidates:
        return None, None
    return min(candidates, key=lambda x: x[1])[0].strftime("%Y-%m-%d"), "inferred_year"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", default=DEFAULT_XLSX, help="Path to patched migration XLSX")
    args = parser.parse_args()
    xlsx = Path(args.xlsx)
    if not xlsx.is_file():
        print(f"XLSX not found: {xlsx}", file=sys.stderr)
        return 1

    sheets = pd.read_excel(xlsx, sheet_name=None)
    pkgs = sheets["Daycare Packages"]
    usage = sheets["Daycare Usage"]

    pkg_purchase = {
        p["PackageTrackerID"]: parse_purchase_to_ts(p["DateOfPurchase"])
        for _, p in pkgs.iterrows()
        if pd.notna(p.get("PackageTrackerID"))
    }

    recovery_rows: list[tuple] = []
    skipped_strict_ok = 0
    skipped_unparseable = 0

    for _, u in usage.iterrows():
        raw = u["UsageDateRaw"]
        tracker = u.get("PackageTrackerID")
        if pd.isna(tracker):
            skipped_unparseable += 1
            continue

        if parse_strict_iso_start(raw) is not None:
            skipped_strict_ok += 1
            continue

        session_date, method = parse_usage_date_smart(raw, pkg_purchase.get(tracker), str(tracker))
        if session_date is None or method is None or method == "iso_start":
            skipped_unparseable += 1
            continue

        owner = u["FinalClientUID"]
        pet_uids = split_pet_uids(u["FinalPetUIDs"])
        if not pet_uids:
            skipped_unparseable += 1
            continue

        slot = str(u["UsageSlot"]).strip() if pd.notna(u.get("UsageSlot")) else ""
        multi = is_multi_date_raw(str(raw))
        raw_s = str(raw).strip()

        for puid in pet_uids:
            recovery_rows.append(
                (str(tracker), str(owner), puid, session_date, slot, method, raw_s, multi)
            )

    print(f"Recovery stage rows: {len(recovery_rows)}")
    print(f"  skipped (strict parse would have imported in 4c): {skipped_strict_ok}")
    print(f"  skipped (still unparseable): {skipped_unparseable}")

    sql_parts = [
        """\
-- =============================================================
-- WOOF Phase 5f — Recover dropped daycare sessions
-- =============================================================
-- Generated by migration/scripts/build_phase5f.py
-- Re-parses UsageDateRaw rows that Phase 4c strict parsing skipped.
-- Joins package via invoice notes + purchase_groups (same as Phase 4b).
-- Idempotent: keyed on tracker + usage slot + pet + session_date.
-- Multi-date UsageDateRaw values insert the first parsed date only;
-- notes are tagged MULTI_DATE_REVIEW for staff follow-up.
-- =============================================================

BEGIN;

CREATE TEMP TABLE _recovery_stage (
  tracker_id          text,
  owner_source_ext_id text,
  pet_source_ext_id   text,
  session_date        date,
  usage_slot          text,
  parse_method        text,
  raw_date            text,
  multi_date          boolean
) ON COMMIT DROP;

""",
    ]

    for batch in chunk(recovery_rows, 400):
        values = ",\n  ".join(
            f"({q(t)}, {q(o)}, {q(pu)}, {qd(d)}, {q(slot)}, {q(method)}, {q(raw)}, {'TRUE' if multi else 'FALSE'})"
            for t, o, pu, d, slot, method, raw, multi in batch
        )
        sql_parts.append(f"INSERT INTO _recovery_stage VALUES\n  {values};\n\n")

    sql_parts.append(
        """\
-- Pre-flight: rows that will not resolve (expect 0 before insert)
SELECT s.tracker_id, s.owner_source_ext_id, s.pet_source_ext_id, s.session_date
FROM _recovery_stage s
LEFT JOIN owners o ON o.source_external_id = s.owner_source_ext_id
LEFT JOIN pets p ON p.source_external_id = s.pet_source_ext_id
LEFT JOIN invoices i ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || s.tracker_id || ' |%'
WHERE o.id IS NULL OR p.id IS NULL OR i.id IS NULL
ORDER BY 1, 2
LIMIT 50;

INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
SELECT DISTINCT ON (p.id, pg.package_def_id, s.session_date, s.usage_slot)
       o.id,
       p.id,
       pg.package_def_id,
       s.session_date,
       true,
       'Legacy migration | tracker=' || s.tracker_id ||
       ' | slot=' || COALESCE(NULLIF(s.usage_slot, ''), '?') ||
       ' | recovered=' || s.parse_method ||
       ' | date_raw=' || s.raw_date ||
       CASE WHEN s.multi_date THEN ' | MULTI_DATE_REVIEW' ELSE '' END
FROM _recovery_stage s
JOIN owners o ON o.source_external_id = s.owner_source_ext_id
JOIN pets p ON p.source_external_id = s.pet_source_ext_id
JOIN invoices i ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || s.tracker_id || ' |%'
JOIN purchase_groups pg ON pg.invoice_id = i.id
WHERE NOT EXISTS (
  SELECT 1
  FROM daycare_sessions ds
  WHERE ds.pet_id = p.id
    AND ds.package_id = pg.package_def_id
    AND ds.session_date = s.session_date
    AND ds.notes LIKE '%tracker=' || s.tracker_id || '%'
    AND ds.notes LIKE '%slot=' || COALESCE(NULLIF(s.usage_slot, ''), '?') || '%'
)
ORDER BY p.id, pg.package_def_id, s.session_date, s.usage_slot, pg.id;

-- Verification
SELECT
  COUNT(*) FILTER (WHERE notes LIKE 'Legacy migration%recovered=%') AS recovered_sessions,
  COUNT(*) FILTER (WHERE notes LIKE 'Legacy migration%MULTI_DATE_REVIEW%') AS multi_date_to_review,
  (SELECT COUNT(*) FROM daycare_sessions WHERE notes LIKE 'Legacy migration%') AS total_legacy_sessions
FROM daycare_sessions;

SELECT
  CASE
    WHEN notes LIKE '%recovered=iso_anywhere%' THEN 'iso_anywhere'
    WHEN notes LIKE '%recovered=ddmmyy%' THEN 'ddmmyy'
    WHEN notes LIKE '%recovered=inferred_year%' THEN 'inferred_year'
    WHEN notes LIKE '%recovered=iso_start%' THEN 'iso_start'
    ELSE 'original_strict_parse'
  END AS parse_method,
  COUNT(*)
FROM daycare_sessions
WHERE notes LIKE 'Legacy migration%'
GROUP BY 1
ORDER BY 1;

SELECT ds.session_date, p.name AS pet, o.first_name AS owner, ds.notes
FROM daycare_sessions ds
JOIN pets p ON p.id = ds.pet_id
JOIN owners o ON o.id = ds.owner_id
WHERE ds.notes LIKE 'Legacy migration%recovered=%'
ORDER BY random()
LIMIT 10;

COMMIT;
"""
    )

    OUT_SQL.parent.mkdir(parents=True, exist_ok=True)
    OUT_SQL.write_text("".join(sql_parts), encoding="utf-8")
    print(f"Wrote {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
