#!/usr/bin/env python3
"""Load Main Branch CSV package into local staging JSON (idempotent)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from msh_import_lib import (
    DEFAULT_INPUT_DIR,
    INPUT_FILES,
    NIGHT_DETAIL_FILE,
    contains_little_gems,
    enrich_boarding_from_night_detail,
    read_csv,
    save_staging,
    stay_period,
    update_meta,
    utc_now_iso,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help="Folder containing the filtered Main Branch CSV package",
    )
    args = parser.parse_args()

    loaded: dict[str, int] = {}
    little_gems_hits = 0

    for key, filename in INPUT_FILES.items():
        path = args.input_dir / filename
        if not path.exists():
            print(f"ERROR: missing required file {path}", file=sys.stderr)
            return 1
        rows = read_csv(path)
        for row in rows:
            if contains_little_gems(
                row.get("owner_name"),
                row.get("kennel"),
                row.get("inhouse_kennel"),
                row.get("card_kennel"),
                row.get("boarding_area"),
                row.get("customer_key"),
            ):
                little_gems_hits += 1
        if key == "boarding":
            night_path = args.input_dir / NIGHT_DETAIL_FILE
            if night_path.exists():
                night_rows = read_csv(night_path)
                filled = enrich_boarding_from_night_detail(rows, night_rows)
                print(f"  Enriched {filled} boarding rows with calendar_room from night detail")
            else:
                for row in rows:
                    row["stay_period"] = stay_period(row)
        save_staging(key, rows)
        loaded[key] = len(rows)
        print(f"Loaded {len(rows):>5} rows -> stg_{key} ({filename})")

    if little_gems_hits:
        print(
            f"WARNING: {little_gems_hits} rows contain 'Little Gems' text — they will be blocked on validate.",
            file=sys.stderr,
        )

    update_meta(
        input_dir=str(args.input_dir),
        loaded_at=utc_now_iso(),
        row_counts=loaded,
        little_gems_rows_detected=little_gems_hits,
    )
    print("Staging load complete (dry-run safe, no database writes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
