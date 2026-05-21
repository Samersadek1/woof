#!/usr/bin/env python3
"""Match stg_pets within matched customers; push IDs into stg_boarding_import."""

from __future__ import annotations

import argparse
import sys

from msh_import_lib import (
    AUTO_PET_MATCH_STATUSES,
    fetch_msh_snapshot,
    get_supabase_client,
    load_staging,
    match_pet_row,
    save_staging,
    update_meta,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    customers = {r["customer_key"]: r for r in load_staging("customers")}
    pets = load_staging("pets")
    boarding = load_staging("boarding")

    if args.offline:
        print("Offline mode — skipped.")
        return 0

    client = get_supabase_client()
    snap = fetch_msh_snapshot(client)

    pet_summary: dict[str, int] = {}
    final_pets = []
    auto = 0
    manual = 0

    for row in pets:
        out = dict(row)
        cust = customers.get(out.get("customer_key", ""), {})
        owner_id = (cust.get("msh_customer_id") or out.get("msh_customer_id") or "").strip()
        if not owner_id:
            out["msh_customer_id"] = ""
            out["msh_pet_id"] = ""
            out["msh_match_status"] = "customer_unmatched"
            pet_summary["customer_unmatched"] = pet_summary.get("customer_unmatched", 0) + 1
            manual += 1
            final_pets.append(out)
            continue

        out["msh_customer_id"] = owner_id
        hit, status, alts = match_pet_row(out, owner_id, snap.pets)
        out["msh_match_status"] = status
        if hit and status in AUTO_PET_MATCH_STATUSES:
            out["msh_pet_id"] = hit["id"]
            out["msh_db_pet_name"] = hit.get("name")
            auto += 1
        else:
            out["msh_pet_id"] = ""
            if status.startswith("fuzzy"):
                out["fuzzy_pet_alternatives"] = [
                    {"id": a["id"], "name": a.get("name")} for a in alts[:5]
                ]
            manual += 1
        pet_summary[status] = pet_summary.get(status, 0) + 1
        final_pets.append(out)

    save_staging("pets", final_pets)

    # Index pets by profile key and (customer_key + pet_name_norm)
    by_profile = {r.get("pet_profile_key", ""): r for r in final_pets if r.get("pet_profile_key")}
    by_name = {}
    for r in final_pets:
        key = f"{r.get('customer_key', '')}|{r.get('pet_name_norm', '')}"
        by_name[key] = r

    boarding_out = []
    pushed = 0
    for row in boarding:
        out = dict(row)
        pet_row = None
        smk = (out.get("source_match_key") or "").strip()
        if smk and smk in by_profile:
            pet_row = by_profile[smk]
        else:
            key = f"{out.get('customer_key', '')}|{out.get('pet_name_norm', '')}"
            pet_row = by_name.get(key)
        if not pet_row:
            for r in final_pets:
                if (
                    r.get("owner_name_norm") == out.get("owner_name_norm")
                    and r.get("pet_name_norm") == out.get("pet_name_norm")
                ):
                    pet_row = r
                    break

        if pet_row:
            out["msh_customer_id"] = pet_row.get("msh_customer_id", "")
            out["msh_pet_id"] = pet_row.get("msh_pet_id", "")
            out["msh_match_status"] = pet_row.get("msh_match_status", "")
            if out["msh_customer_id"] and out["msh_pet_id"]:
                pushed += 1
        boarding_out.append(out)

    save_staging("boarding", boarding_out)
    update_meta(
        pet_match_summary=pet_summary,
        pets_auto_matched=auto,
        pets_manual=manual,
        boarding_rows_with_ids=pushed,
    )

    print("Pet matching complete:")
    for k, v in sorted(pet_summary.items()):
        print(f"  {k}: {v}")
    print(f"  Auto-matched pets: {auto}")
    print(f"  Boarding rows with msh_customer_id + msh_pet_id: {pushed}/{len(boarding_out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
