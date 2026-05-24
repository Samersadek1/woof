# Phase 5 — migration polish

Run each script in the Supabase SQL editor as **one transaction** (`BEGIN` … `COMMIT`).

| File | Status | Notes |
|------|--------|--------|
| `5a_pet_notes_backfill.sql` | Applied 2026-05-24 | Legacy triplet filled from canonical; POST-CHECK: 1307 / 1315 / 462 |
| `5b_room_b2_wing.sql` | Applied 2026-05-24 | B2 → `back_kennels` |
| `5a_drop_legacy_pet_note_columns.sql` | **Hold** | Run only after UI deploy uses canonical columns only |
| `phase5c_contact_cleanup.sql` | Applied 2026-05-24 | 429 owners staged; POST-CHECK: vet_clinics=41, phone2=258, slash_in_phone=0, text_in_phone=2 (review) |
| `phase5c_contact_cleanup_exec.sql` | Same run | Comment-stripped copy used with `npx supabase db query --linked --file` |

## Phase 5c schema (verified)

- **owners:** `phone`, `phone2`, `vet_name`, `vet_phone`, `emergency_contact_*` — no `vet_clinic_id`
- **vet_clinics:** reference list; upsert by unique `name`

## Phase 5e generator scripts

`build_phase01.py` / `build_phase234.py` are **not in this repo** (only `migration/import_legacy.ts`). Re-apply the six generator fixes from the Phase 5 prompt when those scripts are restored.
