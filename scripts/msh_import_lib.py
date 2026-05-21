"""
Shared library for MSH Main Branch PetExec boarding import (dry-run staging).

MSH schema mapping (Supabase public):
  owners          — customers (email, phone, phone2, customer_id)
  pets            — pet profiles (owner_id, name, feeding_instructions, medications, other_notes)
  bookings        — boarding stays (owner_id, room_id, check_in/out, status, notes)
  booking_pets    — pets on a stay (feeding_notes, medication_notes, special_instructions)
  stay_medications — structured per-stay meds (manual review only for unstructured PetExec text)
  rooms           — room_id required for every booking insert
"""

from __future__ import annotations

import csv
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "data" / "msh_main_branch_complete_filtered_2026-05-19"
STAGING_DIR = ROOT / "staging"
OUTPUT_DIR = ROOT / "output"

INPUT_FILES = {
    "customers": "msh_customer_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv",
    "pets": "msh_pet_profile_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv",
    "boarding": "msh_import_view_MAIN_BRANCH_ONLY_2026-05-19.csv",
}

# Optional — used only to fill calendar_room on import rows (not Calendar_Raw).
NIGHT_DETAIL_FILE = "msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv"

STAGING_FILES = {
    "customers": STAGING_DIR / "stg_customers.json",
    "pets": STAGING_DIR / "stg_pets.json",
    "boarding": STAGING_DIR / "stg_boarding_import.json",
    "meta": STAGING_DIR / "staging_meta.json",
}

LITTLE_GEMS_RE = re.compile(r"little\s*gems", re.I)
DELETED_STATUS_RE = re.compile(r"^(deleted|cancelled)$", re.I)

# PetExec DQ flags (semicolon-separated in CSV)
DQ_CRITICAL = frozenset(
    {
        "vaccine_expired",
        "duplicate_same_pet_dates",
        "missing_contact",
    }
)
DQ_HIGH = frozenset(
    {
        "kennel_unknown_or_blank",
        "vaccine_expiring_soon",
    }
)

NOTE_FIELDS_PET = (
    "feeding_instructions",
    "medications",
    "other_notes",
)
NOTE_FIELDS_BOOKING_PET = (
    "feeding_notes",
    "medication_notes",
    "special_instructions",
)

IMPORT_TO_PET_NOTE = {
    "feeding_instructions": "feeding_instructions",
    "medication_detail": "medications",
    "special_requirements": "other_notes",
    "pet_notes": "other_notes",
    "brought_items": "other_notes",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_dotenv(path: Path | None = None) -> None:
    env_path = path or (ROOT / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def norm_email(email: str | None) -> str:
    return (email or "").strip().lower()


def norm_name(name: str | None) -> str:
    """Case- and punctuation-insensitive key (Jürgen Lear == jurgen lear)."""
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def norm_display_name(name: str | None) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def name_tokens(name: str | None) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (name or "").lower()) if t}


def token_overlap_ratio(a: str | None, b: str | None) -> float:
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# Auto-accept minor spelling differences when the best candidate is clearly ahead.
OWNER_FUZZY_AUTO_MIN = 0.86
OWNER_FUZZY_GAP_MIN = 0.06
PET_FUZZY_AUTO_MIN = 0.86
PET_FUZZY_GAP_MIN = 0.05

AUTO_CUSTOMER_MATCH_STATUSES = frozenset(
    {
        "exact_email",
        "exact_email_name",
        "phone_full",
        "phone_last9",
        "exact_name",
        "fuzzy_name_auto",
    }
)

AUTO_PET_MATCH_STATUSES = frozenset(
    {
        "exact_pet_name",
        "exact_pet_name_active",
        "exact_pet_name_disambiguated",
        "fuzzy_pet_name_auto",
    }
)

MANUAL_REVIEW_MATCH_STATUSES = frozenset(
    {
        "fuzzy_name_review",
        "fuzzy_name_ambiguous",
        "fuzzy_pet_name_review",
        "exact_pet_name_ambiguous",
    }
)


def phone_digits_all(raw: str | None) -> list[str]:
    if not raw:
        return []
    chunks = re.split(r"[|/,;]+", raw)
    out: list[str] = []
    for chunk in chunks:
        digits = re.sub(r"\D", "", chunk)
        if digits:
            out.append(digits)
    return out


def phone_last9(digits: str) -> str:
    return digits[-9:] if len(digits) >= 9 else digits


def stay_period(
    row: dict[str, Any],
    *,
    as_of: datetime | None = None,
) -> str:
    """Classify stay relative to import run date: past | ongoing | future | invalid."""
    start = parse_date(row.get("start_date"))
    end = parse_date(row.get("end_date"))
    if not start or not end:
        return "invalid"
    if start > end:
        return "invalid"
    today = (as_of or datetime.now(timezone.utc)).date()
    sd = datetime.strptime(start, "%Y-%m-%d").date()
    ed = datetime.strptime(end, "%Y-%m-%d").date()
    if ed <= today and sd < today:
        return "past"
    if sd <= today < ed:
        return "ongoing"
    if sd > today:
        return "future"
    if sd == today:
        return "ongoing"
    return "past"


def resolve_kennel_text(row: dict[str, Any]) -> str:
    """Best available room label from import view + optional night-detail enrichment."""
    for field in (
        "kennel_resolved",
        "calendar_room_enriched",
        "inhouse_kennel",
        "card_kennel",
        "kennel",
    ):
        val = (row.get(field) or "").strip()
        if val and norm_display_name(val) not in ("not assigned", "unknown", "n/a", ""):
            return val
    return (row.get("calendar_room_enriched") or row.get("kennel") or "").strip()


def enrich_boarding_from_night_detail(
    boarding_rows: list[dict[str, Any]],
    night_rows: list[dict[str, str]],
) -> int:
    """Attach calendar_room_enriched from pet-night detail (not Calendar_Raw)."""
    by_stay: dict[tuple[str, str, str, str], str] = {}
    for r in night_rows:
        key = (
            (r.get("owner_name") or "").strip(),
            (r.get("pet_name") or "").strip(),
            (r.get("start_date") or "").strip(),
            (r.get("end_date") or "").strip(),
        )
        room = (r.get("calendar_room") or "").strip()
        if room:
            by_stay[key] = room

    filled = 0
    for row in boarding_rows:
        key = (
            (row.get("owner_name") or "").strip(),
            (row.get("pet_name") or "").strip(),
            (row.get("start_date") or "").strip(),
            (row.get("end_date") or "").strip(),
        )
        room = by_stay.get(key, "")
        if room:
            row["calendar_room_enriched"] = room
            filled += 1
        row["kennel_resolved"] = resolve_kennel_text(row)
        row["stay_period"] = stay_period(row)
    return filled


def parse_date(value: str | None) -> str | None:
    v = (value or "").strip()
    if not v:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_dq_flags(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {p.strip() for p in raw.split(";") if p.strip()}


def contains_little_gems(*parts: str | None) -> bool:
    blob = " ".join(p for p in parts if p)
    return bool(LITTLE_GEMS_RE.search(blob))


def fuzzy_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def owner_display_name(owner: dict[str, Any]) -> str:
    return f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip()


def owner_name_similarity(csv_name: str | None, owner: dict[str, Any]) -> float:
    """Combine compact-key and token overlap (handles & / and, minor spelling)."""
    csv_norm = norm_name(csv_name)
    db_norm = norm_name(owner_display_name(owner))
    if not csv_norm or not db_norm:
        return 0.0
    if csv_norm == db_norm:
        return 1.0
    scores = [
        fuzzy_ratio(csv_norm, db_norm),
        token_overlap_ratio(csv_name, owner_display_name(owner)),
    ]
    if csv_norm in db_norm or db_norm in csv_norm:
        scores.append(0.92)
    return max(scores)


def pet_name_similarity(csv_name: str | None, db_name: str | None) -> float:
    want = norm_name(csv_name)
    got = norm_name(db_name)
    if not want or not got:
        return 0.0
    if want == got:
        return 1.0
    scores = [fuzzy_ratio(want, got)]
    if want in got or got in want:
        scores.append(0.92)
    # Case-only differences (KOa vs KOA)
    if (csv_name or "").strip().casefold() == (db_name or "").strip().casefold():
        scores.append(1.0)
    return max(scores)


def pick_owner_from_candidates(
    candidates: list[dict[str, Any]],
    row: dict[str, Any],
) -> tuple[dict[str, Any] | None, str]:
    uniq = list({o["id"]: o for o in candidates}.values())
    if len(uniq) == 1:
        return uniq[0], "unique"
    csv_name = row.get("owner_name") or row.get("owner_name_norm") or ""
    scored = [(owner_name_similarity(csv_name, o), o) for o in uniq]
    scored.sort(key=lambda x: -x[0])
    if not scored or scored[0][0] < OWNER_FUZZY_AUTO_MIN:
        return None, "weak"
    if len(scored) == 1 or scored[0][0] - scored[1][0] >= OWNER_FUZZY_GAP_MIN:
        return scored[0][1], "name_pick"
    return None, "ambiguous"


def disambiguate_pet_candidates(
    candidates: list[dict[str, Any]],
    row: dict[str, Any],
) -> dict[str, Any] | None:
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    breed_key = norm_name(row.get("breed"))
    if breed_key:
        breed_hits = [
            p
            for p in candidates
            if breed_key in norm_name(p.get("breed")) or norm_name(p.get("breed")) in breed_key
        ]
        if len(breed_hits) == 1:
            return breed_hits[0]

    active = [p for p in candidates if p.get("active") is not False]
    if len(active) == 1:
        return active[0]

    # Prefer the newest profile when duplicates share the same normalized name.
    dated = sorted(
        candidates,
        key=lambda p: (p.get("created_at") or "", p.get("id") or ""),
        reverse=True,
    )
    return dated[0]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    keys = fieldnames or sorted({k for r in rows for k in r.keys()})
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in keys})


def load_staging(name: str) -> list[dict[str, Any]]:
    path = STAGING_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"Missing staging file {path}. Run load_msh_boarding_staging.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


def save_staging(name: str, rows: list[dict[str, Any]]) -> None:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    STAGING_FILES[name].write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


def update_meta(**kwargs: Any) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    if STAGING_FILES["meta"].exists():
        meta = json.loads(STAGING_FILES["meta"].read_text(encoding="utf-8"))
    meta.update(kwargs)
    meta["updated_at"] = utc_now_iso()
    STAGING_FILES["meta"].write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


@dataclass
class MshSnapshot:
    owners: list[dict[str, Any]] = field(default_factory=list)
    pets: list[dict[str, Any]] = field(default_factory=list)
    rooms: list[dict[str, Any]] = field(default_factory=list)
    bookings: list[dict[str, Any]] = field(default_factory=list)


def get_supabase_client():
    load_dotenv()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
        or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    )
    if not url or not key:
        raise RuntimeError(
            "Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env for DB matching."
        )
    from supabase import create_client

    return create_client(url, key)


def fetch_msh_snapshot(client) -> MshSnapshot:
    snap = MshSnapshot()

    page_size = 1000
    start = 0
    while True:
        res = (
            client.table("owners")
            .select("id, first_name, last_name, email, phone, phone2, customer_id, notes, other_notes")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = res.data or []
        snap.owners.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    start = 0
    while True:
        res = (
            client.table("pets")
            .select(
                "id, owner_id, name, breed, active, created_at, feeding_instructions, medications, other_notes, special_alerts, species"
            )
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = res.data or []
        snap.pets.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    res = (
        client.table("rooms")
        .select("id, display_name, wing, room_type, pricing_category, is_active")
        .eq("is_active", True)
        .execute()
    )
    snap.rooms = res.data or []

    start = 0
    while True:
        res = (
            client.table("bookings")
            .select(
                "id, owner_id, room_id, check_in_date, check_out_date, status, notes, booking_pets(pet_id)"
            )
            .eq("booking_type", "boarding")
            .neq("status", "cancelled")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = res.data or []
        snap.bookings.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    return snap


def build_owner_indexes(owners: list[dict[str, Any]]):
    by_email: dict[str, list[dict[str, Any]]] = {}
    by_phone_full: dict[str, list[dict[str, Any]]] = {}
    by_phone_last9: dict[str, list[dict[str, Any]]] = {}
    by_name_norm: dict[str, list[dict[str, Any]]] = {}

    for o in owners:
        em = norm_email(o.get("email"))
        if em:
            by_email.setdefault(em, []).append(o)
        for raw in (o.get("phone"), o.get("phone2")):
            for digits in phone_digits_all(raw):
                by_phone_full.setdefault(digits, []).append(o)
                l9 = phone_last9(digits)
                if l9:
                    by_phone_last9.setdefault(l9, []).append(o)
        name_key = norm_name(f"{o.get('first_name', '')} {o.get('last_name', '')}")
        if name_key:
            by_name_norm.setdefault(name_key, []).append(o)

    return by_email, by_phone_full, by_phone_last9, by_name_norm


def pick_unique(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    uniq = {o["id"]: o for o in candidates}
    if len(uniq) == 1:
        return next(iter(uniq.values()))
    return None


def match_customer_row(
    row: dict[str, Any],
    indexes: tuple,
) -> tuple[dict[str, Any] | None, str, list[dict[str, Any]]]:
    by_email, by_phone_full, by_phone_last9, by_name_norm = indexes
    alternatives: list[dict[str, Any]] = []

    email = norm_email(row.get("email"))
    if email:
        email_hits = list({o["id"]: o for o in by_email.get(email, [])}.values())
        if len(email_hits) == 1:
            return email_hits[0], "exact_email", []
        if len(email_hits) > 1:
            picked, how = pick_owner_from_candidates(email_hits, row)
            if picked:
                return picked, "exact_email_name", []

    for digits in phone_digits_all(row.get("phone_digits")):
        phone_hits = list({o["id"]: o for o in by_phone_full.get(digits, [])}.values())
        if len(phone_hits) == 1:
            return phone_hits[0], "phone_full", []
        if len(phone_hits) > 1:
            picked, _ = pick_owner_from_candidates(phone_hits, row)
            if picked:
                return picked, "phone_full", []

        l9 = phone_last9(digits)
        l9_hits = list({o["id"]: o for o in by_phone_last9.get(l9, [])}.values())
        if len(l9_hits) == 1:
            return l9_hits[0], "phone_last9", []
        if len(l9_hits) > 1:
            picked, _ = pick_owner_from_candidates(l9_hits, row)
            if picked:
                return picked, "phone_last9", []

    owner_norm = row.get("owner_name_norm") or norm_display_name(row.get("owner_name"))
    name_key = norm_name(owner_norm)
    if name_key:
        candidates = list({o["id"]: o for o in by_name_norm.get(name_key, [])}.values())
        if len(candidates) == 1:
            return candidates[0], "exact_name", []
        if len(candidates) > 1:
            picked, _ = pick_owner_from_candidates(candidates, row)
            if picked:
                return picked, "exact_name", []
            return None, "fuzzy_name_ambiguous", candidates

    # Fuzzy owner name — auto-match when one clear winner (capitalization / minor spelling).
    all_owners: dict[str, dict[str, Any]] = {}
    for bucket in indexes:
        for group in bucket.values():
            for cand in group:
                all_owners[cand["id"]] = cand
    scored: list[tuple[float, dict[str, Any]]] = []
    for cand in all_owners.values():
        ratio = owner_name_similarity(row.get("owner_name") or owner_norm, cand)
        if ratio >= OWNER_FUZZY_AUTO_MIN:
            scored.append((ratio, cand))
    scored.sort(key=lambda x: -x[0])
    if scored:
        alternatives = [c for _, c in scored[:5]]
        if scored[0][0] >= OWNER_FUZZY_AUTO_MIN and (
            len(scored) == 1 or scored[0][0] - scored[1][0] >= OWNER_FUZZY_GAP_MIN
        ):
            return scored[0][1], "fuzzy_name_auto", alternatives
        return None, "fuzzy_name_review", alternatives

    return None, "unmatched", alternatives


def pets_for_owner(pets: list[dict[str, Any]], owner_id: str) -> list[dict[str, Any]]:
    return [p for p in pets if p.get("owner_id") == owner_id]


def match_pet_row(
    row: dict[str, Any],
    owner_id: str,
    all_pets: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str, list[dict[str, Any]]]:
    pool = pets_for_owner(all_pets, owner_id)
    csv_pet_name = row.get("pet_name") or row.get("pet_name_norm") or ""
    if not norm_name(csv_pet_name):
        return None, "unmatched", []

    exact = [
        p for p in pool if pet_name_similarity(csv_pet_name, p.get("name")) >= 0.999
    ]
    if len(exact) == 1:
        return exact[0], "exact_pet_name", []
    if len(exact) > 1:
        picked = disambiguate_pet_candidates(exact, row)
        if picked:
            return picked, "exact_pet_name_disambiguated", exact

    fuzzy: list[tuple[float, dict[str, Any]]] = []
    for p in pool:
        ratio = pet_name_similarity(csv_pet_name, p.get("name"))
        if ratio >= PET_FUZZY_AUTO_MIN:
            fuzzy.append((ratio, p))
    fuzzy.sort(key=lambda x: -x[0])
    if fuzzy:
        alts = [p for _, p in fuzzy[:5]]
        top_score = fuzzy[0][0]
        second_score = fuzzy[1][0] if len(fuzzy) > 1 else 0.0
        if top_score >= PET_FUZZY_AUTO_MIN and (
            len(fuzzy) == 1 or top_score - second_score >= PET_FUZZY_GAP_MIN
        ):
            return fuzzy[0][1], "fuzzy_pet_name_auto", alts
        return None, "fuzzy_pet_name_review", alts
    return None, "unmatched", []


def suggest_rooms(
    kennel: str,
    rooms: list[dict[str, Any]],
    *,
    species: str | None = None,
) -> list[dict[str, Any]]:
    raw = norm_display_name(kennel)
    if contains_little_gems(raw):
        return []
    if raw in ("not assigned", "unknown", "n/a", ""):
        return []

    is_cat = (
        "cattery" in raw
        or raw.endswith(" cat")
        or (species or "").lower() == "cat"
    )
    pool = [r for r in rooms if (r.get("wing") == "cattery") == is_cat]

    # PetExec / calendar labels → pricing hints
    hints: list[str] = []
    if "presidential" in raw or "super presidential" in raw:
        hints.extend(["presidential", "super_presidential"])
    if "royal" in raw:
        hints.append("royal")
    if "deluxe" in raw or "dluxe" in raw:
        hints.append("deluxe")
    if "standard" in raw:
        hints.append("standard")
    if "family" in raw:
        hints.append("family")
    if "fleet" in raw:
        hints.append("fleet")
    if "single" in raw or "single occupancy" in raw:
        hints.append("single")
    if "double" in raw or "twin" in raw or "triple" in raw:
        hints.extend(["double", "twin", "multiple"])
    if "annex" in raw:
        hints.append("royal")
    if "glass" in raw:
        hints.append("standard")
    if "additional" in raw and "deluxe" in raw:
        hints.append("deluxe")

    compact = norm_name(kennel)
    scored = []
    for r in pool:
        dn = norm_display_name(r.get("display_name"))
        rt = norm_display_name(r.get("room_type"))
        pc = norm_display_name(r.get("pricing_category"))
        score = 0
        for h in hints:
            if h in dn or h in rt or h in pc or h.replace("_", "") in norm_name(dn + rt + pc):
                score += 12
        if raw in dn or dn in raw:
            score += 30
        if compact and compact in norm_name(dn):
            score += 20
        if score:
            scored.append({**r, "match_score": score})
    scored.sort(key=lambda x: -x["match_score"])
    return scored[:8]


def booking_identity(row: dict[str, Any]) -> str:
    bid = (row.get("boarding_id") or "").strip()
    if bid:
        return f"boarding_id:{bid}"
    return (
        f"petstay:{row.get('msh_pet_id', '')}|{row.get('start_date', '')}|{row.get('end_date', '')}"
    )


def note_nonempty(val: Any) -> bool:
    return bool(str(val or "").strip())


def would_overwrite_notes(
    row: dict[str, Any],
    pet: dict[str, Any] | None,
) -> list[str]:
    """Return list of conflicting fields where MSH already has content."""
    conflicts: list[str] = []
    if not pet:
        return conflicts
    for src_field, pet_field in IMPORT_TO_PET_NOTE.items():
        incoming = (row.get(src_field) or "").strip()
        if not incoming:
            continue
        existing = (pet.get(pet_field) or "").strip()
        if note_nonempty(existing):
            conflicts.append(pet_field)
    return conflicts


def classify_boarding_row(
    row: dict[str, Any],
    pet: dict[str, Any] | None,
    room: dict[str, Any] | None,
    *,
    seen_identities: set[str],
) -> tuple[str, list[str]]:
    """Return (bucket, block_reasons) where bucket is safe|manual_review|blocked."""
    reasons: list[str] = []

    if contains_little_gems(
        row.get("kennel"),
        row.get("inhouse_kennel"),
        row.get("card_kennel"),
        row.get("owner_name"),
        row.get("boarding_area"),
    ):
        reasons.append("little_gems")

    if not (row.get("msh_customer_id") or "").strip():
        reasons.append("missing_msh_customer_id")
    if not (row.get("msh_pet_id") or "").strip():
        reasons.append("missing_msh_pet_id")

    status = (row.get("boarding_status") or "").strip()
    if DELETED_STATUS_RE.match(status):
        reasons.append("deleted_or_cancelled_status")

    start = parse_date(row.get("start_date"))
    end = parse_date(row.get("end_date"))
    if not start or not end:
        reasons.append("invalid_dates")
    elif start > end:
        reasons.append("start_after_end")

    flags = parse_dq_flags(row.get("data_quality_flags"))
    if flags & DQ_CRITICAL:
        reasons.append("critical_dq:" + ",".join(sorted(flags & DQ_CRITICAL)))
    if "duplicate_same_pet_dates" in flags:
        reasons.append("duplicate_same_pet_dates")
    if "vaccine_expired" in flags:
        reasons.append("vaccine_expired")

    if note_nonempty(row.get("medication_detail")):
        reasons.append("medication_detail_requires_manual_review")

    conflicts = would_overwrite_notes(row, pet)
    if conflicts:
        reasons.append("would_overwrite_notes:" + ",".join(conflicts))

    if row.get("msh_match_status", "") in MANUAL_REVIEW_MATCH_STATUSES:
        reasons.append("fuzzy_match")

    period = row.get("stay_period") or stay_period(row)
    row["stay_period"] = period

    if not room:
        if period == "future":
            reasons.append("future_needs_room")
        elif period in ("past", "ongoing"):
            reasons.append("historical_needs_room")
        else:
            reasons.append("no_room_mapping")

    ident = booking_identity(row)
    if ident in seen_identities:
        reasons.append("duplicate_booking_identity")
    else:
        seen_identities.add(ident)

    hard = {
        "little_gems",
        "missing_msh_customer_id",
        "missing_msh_pet_id",
        "deleted_or_cancelled_status",
        "invalid_dates",
        "start_after_end",
        "duplicate_same_pet_dates",
        "vaccine_expired",
        "duplicate_booking_identity",
    }
    if any(r == x or r.startswith(x + ":") for r in reasons for x in hard):
        return "blocked", reasons

    soft = {
        "medication_detail_requires_manual_review",
        "would_overwrite_notes",
        "fuzzy_match",
        "future_needs_room",
        "historical_needs_room",
        "no_room_mapping",
        "critical_dq",
    }
    if any(any(r.startswith(s) for s in soft) for r in reasons):
        return "manual_review", reasons

    # Deposit export often lacks kennel; night-detail room mapping is authoritative.
    if flags & DQ_HIGH and not room:
        return "manual_review", reasons + ["high_dq_flags"]

    return "safe", reasons


def build_booking_payload_row(row: dict[str, Any], room_id: str) -> dict[str, Any]:
    start = parse_date(row.get("start_date"))
    end = parse_date(row.get("end_date"))
    notes_parts = [
        "Imported from PetExec Main Branch staging",
        f"PetExec boarding_id: {row.get('boarding_id', '').strip()}" if row.get("boarding_id") else "",
        f"source_match_key: {row.get('source_match_key', '').strip()}" if row.get("source_match_key") else "",
        f"PetExec kennel: {row.get('kennel', '').strip()}" if row.get("kennel") else "",
        f"PetExec status: {row.get('boarding_status', '').strip()}" if row.get("boarding_status") else "",
    ]
    if row.get("data_quality_flags"):
        notes_parts.append(f"DQ flags: {row.get('data_quality_flags')}")

    status = "confirmed"
    if DELETED_STATUS_RE.match((row.get("boarding_status") or "").strip()):
        status = "cancelled"

    return {
        "owner_id": row["msh_customer_id"],
        "room_id": room_id,
        "check_in_date": start,
        "check_out_date": end,
        "status": status,
        "booking_type": "boarding",
        "notes": "\n".join(p for p in notes_parts if p),
        "do_not_move": False,
        "pickup_required": False,
        "dropoff_required": False,
        "pet_id": row["msh_pet_id"],
        "booking_pets": {
            "pet_id": row["msh_pet_id"],
            "feeding_notes": None,
            "medication_notes": None,
            "special_instructions": None,
        },
        "booking_identity": booking_identity(row),
        "boarding_id": row.get("boarding_id"),
        "source_match_key": row.get("source_match_key"),
    }


def find_existing_booking(
    row: dict[str, Any],
    bookings: list[dict[str, Any]],
) -> dict[str, Any] | None:
    bid = (row.get("boarding_id") or "").strip()
    pet_id = row.get("msh_pet_id")
    start = parse_date(row.get("start_date"))
    end = parse_date(row.get("end_date"))

    for b in bookings:
        if bid and bid in (b.get("notes") or ""):
            return b
        b_pets = [bp.get("pet_id") for bp in (b.get("booking_pets") or [])]
        if (
            pet_id
            and pet_id in b_pets
            and b.get("owner_id") == row.get("msh_customer_id")
            and b.get("check_in_date") == start
            and b.get("check_out_date") == end
        ):
            return b
    return None
