# Legacy Import Report

## Imported row totals

- rooms (`source_external_id LIKE 'ROOM-%'`): 97
- owners (`source_external_id LIKE 'CL%'`): 1,135
- pets (`source_external_id LIKE 'CL%'`): 1,468
- bookings (`source_external_id LIKE 'BOOK-%'`): 257
- booking_pets (joined to imported bookings): 311
- booking_room_assignments: 1,123

## Date range

Imported bookings are future-dated (`2027-05-23` through `2027-07-23`) and this is expected for the legacy workbook.

## Edge cases + reconciliation notes

- 91 multi-room same-night cases are present in `migration/staging/multi_room_flags.json` and require manual operational review.
- 183 `Review` + `Unmatched` room assignments were excluded and remain in the source workbook under `MatchStatus` for later reconciliation.
- 17 duplicate client groups (7 HIGH, 3 MEDIUM, 7 LOW) were intentionally not auto-merged; review in `migration/staging/duplicates_review.csv`.
- Full cleanup and transformation audit is documented in `migration/staging/CLEANUP_REPORT.md`.

## Special follow-up record

- `CL000982-P01` was imported as a single pet record, but represents three dogs (Oliver, Nemo, Smakka).
- The split requirement and Nemo boarding/daycare restriction are preserved in `pets.behaviour_notes` for post-import staff action.
