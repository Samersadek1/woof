#!/usr/bin/env python3
"""Generate /output reports and safe import payload. Use --apply for DB writes."""

from __future__ import annotations

import argparse
import json
import sys

from msh_import_lib import (
    OUTPUT_DIR,
    build_booking_payload_row,
    fetch_msh_snapshot,
    find_existing_booking,
    get_supabase_client,
    grandfather_import_pets_for_apply,
    load_staging,
    update_meta,
    write_csv,
)


def split_rows(boarding, customers, pets):
    matched_customers = [r for r in customers if r.get("msh_customer_id")]
    manual_customers = [r for r in customers if not r.get("msh_customer_id")]
    matched_pets = [r for r in pets if r.get("msh_pet_id")]
    manual_pets = [r for r in pets if not r.get("msh_pet_id")]

    matched_boarding = []
    manual_boarding = []
    blocked = []
    safe = []

    for r in boarding:
        b = r.get("validation_bucket", "")
        if b == "safe":
            safe.append(r)
        elif b == "blocked":
            blocked.append(r)
        else:
            manual_boarding.append(r)
        if r.get("msh_customer_id") and r.get("msh_pet_id"):
            matched_boarding.append(r)

    return (
        matched_customers,
        manual_customers,
        matched_pets,
        manual_pets,
        matched_boarding,
        manual_boarding,
        blocked,
        safe,
    )


def validate_outputs(payload_rows: list[dict], blocked: list[dict], boarding: list[dict]) -> list[str]:
    from msh_import_lib import booking_identity

    errors = []
    for r in payload_rows:
        blob = json.dumps(r).lower()
        if "little gems" in blob or "little g" in blob.split("little gems")[0]:
            if "little gem" in blob:
                errors.append("Little Gems text found in safe payload")
                break
    for r in payload_rows:
        if not r.get("owner_id") and not r.get("msh_customer_id"):
            errors.append("Safe row missing msh_customer_id")
            break
        if not r.get("pet_id") and not r.get("msh_pet_id"):
            errors.append("Safe row missing msh_pet_id")
            break
    ids = [r.get("booking_identity") or booking_identity(r) for r in payload_rows]
    if len(ids) != len(set(ids)):
        errors.append("Duplicate booking identity in safe payload")
    return errors


def apply_payload(client, payload: list[dict], existing_bookings) -> dict[str, int]:
    stats = {"inserted": 0, "skipped_existing": 0, "errors": 0}
    manifest_path = OUTPUT_DIR / "apply_manifest.json"
    manifest: dict[str, str] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    for row in payload:
        ident = row["booking_identity"]
        if ident in manifest:
            stats["skipped_existing"] += 1
            continue
        if find_existing_booking(row, existing_bookings):
            stats["skipped_existing"] += 1
            manifest[ident] = "existing"
            continue
        try:
            booking_insert = {
                "owner_id": row["owner_id"],
                "room_id": row["room_id"],
                "check_in_date": row["check_in_date"],
                "check_out_date": row["check_out_date"],
                "status": row["status"],
                "booking_type": "boarding",
                "notes": row["notes"],
                "do_not_move": False,
                "pickup_required": False,
                "dropoff_required": False,
            }
            res = client.table("bookings").insert(booking_insert).execute()
            booking = res.data[0]
            bp = row["booking_pets"]
            try:
                client.table("booking_pets").insert(
                    {
                        "booking_id": booking["id"],
                        "pet_id": bp["pet_id"],
                        "feeding_notes": bp.get("feeding_notes"),
                        "medication_notes": bp.get("medication_notes"),
                        "special_instructions": bp.get("special_instructions"),
                    }
                ).execute()
            except Exception as pet_err:
                client.table("bookings").delete().eq("id", booking["id"]).execute()
                raise pet_err
            manifest[ident] = booking["id"]
            stats["inserted"] += 1
        except Exception as e:
            print(f"ERROR applying {ident}: {e}", file=sys.stderr)
            stats["errors"] += 1

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return stats


def write_summary(path, totals: dict) -> None:
    lines = [
        "# MSH Main Branch boarding import summary",
        "",
        f"Generated: {totals.get('generated_at', '')}",
        "",
        "## Row counts",
        "",
        "| Metric | Count |",
        "|--------|------:|",
    ]
    for key in (
        "import_view_rows",
        "customer_template_rows",
        "pet_template_rows",
        "matched_customers",
        "matched_pets",
        "matched_boarding_with_ids",
        "safe_import_rows",
        "manual_review_boarding",
        "manual_review_boarding_past",
        "manual_review_boarding_ongoing",
        "manual_review_boarding_future",
        "blocked_rows",
        "manual_review_customers",
        "manual_review_pets",
    ):
        if key in totals:
            lines.append(f"| {key.replace('_', ' ').title()} | {totals.get(key, 0)} |")
    lines.extend(
        [
            "",
            "## Manual review boarding (by stay period)",
            "",
            "Most manual-review rows are **matched** customers/pets but lack a resolvable room in the",
            "PetExec deposit export. They are predominantly **past** or **ongoing** stays (historical",
            "calendar backfill), not failed name matching. Use `calendar_room_enriched` and assign",
            "a room in MSH before import.",
            "",
            "## Validation gates (pre-apply)",
            "",
            "- No Little Gems rows in safe payload",
            "- Every safe row has `msh_customer_id` and `msh_pet_id`",
            "- No critical DQ, vaccine expired, duplicate same pet/date, or deleted status in safe set",
            "- No automatic overwrite of non-blank MSH pet notes",
            "- Medication detail rows are manual review only",
            "- One action per booking identity",
            "",
            "## Apply",
            "",
            "Dry-run is the default. To write bookings:",
            "",
            "```bash",
            "python scripts/generate_msh_boarding_payload.py --apply",
            "```",
            "",
            "Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Insert safe bookings into Supabase (non-destructive; skips existing)",
    )
    args = parser.parse_args()

    customers = load_staging("customers")
    pets = load_staging("pets")
    boarding = load_staging("boarding")

    (
        matched_customers,
        manual_customers,
        matched_pets,
        manual_pets,
        matched_boarding,
        manual_boarding,
        blocked,
        safe,
    ) = split_rows(boarding, customers, pets)

    payload = []
    for row in safe:
        room_id = row.get("suggested_room_id", "")
        if not room_id:
            continue
        p = build_booking_payload_row(row, room_id)
        payload.append(p)

    errs = validate_outputs(payload, blocked, boarding)
    if errs:
        print("VALIDATION FAILED:", "; ".join(errs), file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(OUTPUT_DIR / "matched_customers.csv", matched_customers)
    write_csv(OUTPUT_DIR / "matched_pets.csv", matched_pets)
    write_csv(OUTPUT_DIR / "matched_boarding_import.csv", matched_boarding)
    write_csv(OUTPUT_DIR / "manual_review_customers.csv", manual_customers)
    write_csv(OUTPUT_DIR / "manual_review_pets.csv", manual_pets)
    write_csv(OUTPUT_DIR / "manual_review_boarding_rows.csv", manual_boarding)
    past_manual = [r for r in manual_boarding if r.get("stay_period") == "past"]
    ongoing_manual = [r for r in manual_boarding if r.get("stay_period") == "ongoing"]
    future_manual = [r for r in manual_boarding if r.get("stay_period") == "future"]
    write_csv(OUTPUT_DIR / "manual_review_boarding_past.csv", past_manual)
    write_csv(OUTPUT_DIR / "manual_review_boarding_ongoing.csv", ongoing_manual)
    write_csv(OUTPUT_DIR / "manual_review_boarding_future.csv", future_manual)
    write_csv(OUTPUT_DIR / "blocked_rows.csv", blocked)
    write_csv(OUTPUT_DIR / "safe_import_payload.csv", payload)
    (OUTPUT_DIR / "safe_import_payload.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )

    totals = {
        "import_view_rows": len(boarding),
        "customer_template_rows": len(customers),
        "pet_template_rows": len(pets),
        "matched_customers": len(matched_customers),
        "matched_pets": len(matched_pets),
        "matched_boarding_with_ids": sum(
            1 for r in boarding if r.get("msh_customer_id") and r.get("msh_pet_id")
        ),
        "safe_import_rows": len(payload),
        "manual_review_boarding": len(manual_boarding),
        "manual_review_boarding_past": len(past_manual),
        "manual_review_boarding_ongoing": len(ongoing_manual),
        "manual_review_boarding_future": len(future_manual),
        "blocked_rows": len(blocked),
        "manual_review_customers": len(manual_customers),
        "manual_review_pets": len(manual_pets),
    }
    from msh_import_lib import utc_now_iso

    totals["generated_at"] = utc_now_iso()
    write_summary(OUTPUT_DIR / "import_summary.md", totals)
    update_meta(output_totals=totals, safe_payload_rows=len(payload))

    print("Output files written to", OUTPUT_DIR)
    for k, v in totals.items():
        print(f"  {k}: {v}")

    if args.apply:
        if not payload:
            print("Nothing to apply.", file=sys.stderr)
            return 0
        client = get_supabase_client(require_service_role=True)
        n_pets = grandfather_import_pets_for_apply(client, payload)
        print(f"Grandfathered assessment for {n_pets} pet(s) in import payload")
        snap = fetch_msh_snapshot(client)
        stats = apply_payload(client, payload, snap.bookings)
        print("Apply stats:", stats)
        if stats["errors"]:
            return 1
    else:
        print("Dry-run only. Pass --apply to insert safe bookings.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
