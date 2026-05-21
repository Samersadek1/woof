#!/usr/bin/env python3
"""Validate staged boarding rows; annotate bucket + block reasons (dry-run)."""

from __future__ import annotations

import argparse
import json
import sys

from msh_import_lib import (
    OUTPUT_DIR,
    booking_identity,
    classify_boarding_row,
    fetch_msh_snapshot,
    get_supabase_client,
    load_staging,
    infer_import_tier,
    resolve_room_for_import,
    _species_from_row_and_pet,
    save_staging,
    stay_period,
    update_meta,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    rows = load_staging("boarding")
    pets_by_id = {}
    rooms = []

    if not args.offline:
        client = get_supabase_client()
        snap = fetch_msh_snapshot(client)
        pets_by_id = {p["id"]: p for p in snap.pets}
        rooms = snap.rooms

    validated = []
    counts = {"safe": 0, "manual_review": 0, "blocked": 0}
    period_counts: dict[str, int] = {}
    seen_identities: set[str] = set()

    for row in rows:
        out = dict(row)
        out["stay_period"] = out.get("stay_period") or stay_period(out)
        period_counts[out["stay_period"]] = period_counts.get(out["stay_period"], 0) + 1
        pet = pets_by_id.get(out.get("msh_pet_id", ""))
        species = (pet or {}).get("species")
        suggestions = resolve_room_for_import(out, rooms, pet) if rooms else []
        room = suggestions[0] if suggestions else None
        out["suggested_room_id"] = room["id"] if room else ""
        out["suggested_room_name"] = room.get("display_name") if room else ""
        sp = _species_from_row_and_pet(out, pet)
        out["import_tier"] = infer_import_tier(out, species=sp)
        out["uses_placeholder_room"] = bool(
            room and (room.get("wing") == "import_placeholder" or (room.get("room_number") or "").startswith("UNK-"))
        )

        bucket, reasons = classify_boarding_row(
            out, pet, room, seen_identities=seen_identities
        )
        out["validation_bucket"] = bucket
        out["block_reasons"] = ";".join(reasons)
        out["booking_identity"] = booking_identity(out)
        counts[bucket] += 1
        validated.append(out)

    save_staging("boarding", validated)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "validation_counts.json").write_text(
        json.dumps(counts, indent=2), encoding="utf-8"
    )
    update_meta(validation_counts=counts, stay_period_counts=period_counts)

    print("Validation complete:")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print("  By stay period:", period_counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
