# MSH Boarding Main Branch Filtered Files

Generated from the uploaded CSVs. These outputs exclude Little Gems rows and are intended for the main branch system only.

## Files

- `msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv`
  - Primary file for Cursor/main branch work.
  - Contains only rows where `branch_site = Main Branch`.
  - Excludes rows where branch/room/raw text contains Little Gems.

- `msh_boarding_pets_per_night_view_MAIN_BRANCH_ONLY_2026-05-19.csv`
  - Optional operational summary only.
  - The Little Gems column was removed.
  - `total_boarding_pets` was removed because it included Little Gems. Use `main_branch` as the total main-branch pets per night.

## Cursor instruction

Use the detail CSV as the primary data source. Do not use Little Gems rows. Do not use the removed total boarding count as an import source.

Primary source:

```text
data/msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv
```

Rules:

1. Treat each row as one pet-night record for Main Branch only.
2. Do not import or infer anything from Little Gems.
3. Use `branch_site`, `boarding_area`, and `calendar_room` only for main branch room/area mapping.
4. Keep `calendar_raw` as the source trace/reference.
5. Use the optional per-night view only for sanity checking daily volumes, not as the import source.
