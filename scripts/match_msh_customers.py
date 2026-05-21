#!/usr/bin/env python3
"""Match stg_customers to MSH owners (email, phone, fuzzy name for review only)."""

from __future__ import annotations

import argparse
import sys

from msh_import_lib import (
    AUTO_CUSTOMER_MATCH_STATUSES,
    build_owner_indexes,
    fetch_msh_snapshot,
    get_supabase_client,
    load_staging,
    match_customer_row,
    save_staging,
    update_meta,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip Supabase fetch (CSV staging load test only)",
    )
    args = parser.parse_args()

    rows = load_staging("customers")

    if args.offline:
        print("Offline mode — no DB matching performed.")
        return 0

    client = get_supabase_client()
    snap = fetch_msh_snapshot(client)
    indexes = build_owner_indexes(snap.owners)

    summary: dict[str, int] = {}
    final = []
    auto_matched = 0
    manual = 0

    for row in rows:
        out = dict(row)
        hit, status, alts = match_customer_row(out, indexes)
        out["msh_match_status"] = status
        if hit and status in AUTO_CUSTOMER_MATCH_STATUSES:
            out["msh_customer_id"] = hit["id"]
            out["msh_db_name"] = f"{hit.get('first_name', '')} {hit.get('last_name', '')}".strip()
            auto_matched += 1
        else:
            out["msh_customer_id"] = ""
            if status.startswith("fuzzy"):
                out["fuzzy_alternatives"] = [
                    {
                        "id": a["id"],
                        "name": f"{a.get('first_name', '')} {a.get('last_name', '')}".strip(),
                        "email": a.get("email"),
                        "phone": a.get("phone"),
                    }
                    for a in alts[:5]
                ]
            manual += 1
        summary[status] = summary.get(status, 0) + 1
        final.append(out)

    save_staging("customers", final)
    update_meta(customer_match_summary=summary, owners_in_db=len(snap.owners))

    print("Customer matching complete:")
    for k, v in sorted(summary.items()):
        print(f"  {k}: {v}")
    print(f"  Auto-matched: {auto_matched}")
    print(f"  Needs manual review / unmatched: {manual}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
