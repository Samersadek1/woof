# MSH Main Branch boarding import runbook

PetExec → MSH (Supabase) staging importer for **Main Branch only**. Little Gems is excluded in the source package and blocked again at validation.

**Package directory (default):** `data/msh_main_branch_complete_filtered_2026-05-19/`

## Required input files

| File | Staging table | Role |
|------|---------------|------|
| `msh_customer_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv` | `stg_customers` | Customer matching |
| `msh_pet_profile_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv` | `stg_pets` | Pet matching (within matched customer) |
| `msh_import_view_MAIN_BRANCH_ONLY_2026-05-19.csv` | `stg_boarding_import` | **Primary** boarding import source |
| `msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv` | — | Optional occupancy detail only |
| `msh_boarding_pets_per_night_view_MAIN_BRANCH_ONLY_2026-05-19.csv` | — | Sanity-check counts only (not imported) |

**Do not use:** dashboard/count sheets, `Calendar_Raw`, Little Gems rows, `total_boarding_pets` / `little_gems` summary columns.

## MSH schema mapping (this repo)

| PetExec / staging | Supabase table.column |
|-------------------|------------------------|
| `msh_customer_id` | `owners.id` |
| `msh_pet_id` | `pets.id` |
| Boarding stay | `bookings` (`owner_id`, `room_id`, `check_in_date`, `check_out_date`, `status`, `notes`) |
| Pet on stay | `booking_pets` (`pet_id`, `feeding_notes`, `medication_notes`, `special_instructions`) |
| Structured meds | `stay_medications` — **not** auto-filled from free-text `medication_detail` |
| Care notes | `pets.feeding_instructions`, `pets.medications`, `pets.other_notes` — **append-only / manual review** |

Booking status mapping: PetExec `Active` → MSH `confirmed`; `Deleted` → blocked (not imported).

## Import order

```bash
cd /path/to/admin-essentials
pip install -r requirements-msh-import.txt   # once, for DB matching/apply

python scripts/load_msh_boarding_staging.py
python scripts/match_msh_customers.py
python scripts/match_msh_pets.py
python scripts/validate_msh_boarding_import.py
python scripts/generate_msh_boarding_payload.py
```

Optional custom package path:

```bash
python scripts/load_msh_boarding_staging.py --input-dir ~/Downloads/msh_main_branch_complete_filtered_2026-05-19
```

## Matching logic

### Customers (`match_msh_customers.py`)

1. **Exact email** (case-insensitive) → `exact_email`
2. **Shared email** (e.g. `info@mysecondhomedubai.com`) → pick owner by **name similarity** → `exact_email_name`
3. **Phone** — full digits, then UAE **last 9**; multiple hits resolved by owner name
4. **Exact normalized name** (punctuation/capitalization ignored) → `exact_name`
5. **Fuzzy owner name** — auto-match when one clear winner (≥86% similar, ≥6% ahead of runner-up) → `fuzzy_name_auto`; else `fuzzy_name_review`

Capitalization and minor spelling (e.g. `KOa` / `KOA`, `Jurgen` / `Jürgen`) do not block matching.

### Pets (`match_msh_pets.py`)

Only rows whose customer has `msh_customer_id`.

1. **Exact** pet name (case/punctuation insensitive) → `exact_pet_name`
2. **Duplicate profiles** same name → auto-pick using breed, then active flag, then newest `created_at` → `exact_pet_name_disambiguated`
3. **Fuzzy pet name** — auto when one clear winner (≥86% similar) → `fuzzy_pet_name_auto`; else manual review
4. Pushes IDs onto `stg_boarding_import` via `source_match_key` / `pet_profile_key`

### Booking identity (idempotent)

- Prefer `boarding_id` (stored in `bookings.notes` as `PetExec boarding_id: …` for lookup)
- Else `msh_pet_id + start_date + end_date`

## Blocking rules (excluded from `safe_import_payload`)

- Missing `msh_customer_id` or `msh_pet_id`
- `boarding_status` Deleted / cancelled
- Any Little Gems text in kennel / room / owner fields
- Critical DQ: `vaccine_expired`, `duplicate_same_pet_dates`, `missing_contact`
- Non-empty `medication_detail` (unstructured — use `stay_medications` manually)
- Would overwrite non-blank MSH pet notes (`feeding_instructions`, `medications`, `other_notes`)
- Fuzzy customer/pet match
- No resolvable `room_id` (blank / Not Assigned kennel without night-detail room)
- Duplicate booking identity in the safe set

High DQ (`kennel_unknown_or_blank`, `vaccine_expiring_soon`) → manual review when **no** room could be mapped. When a tier **placeholder** room is assigned, the row can proceed to safe import.

### Unknown kennel (tier placeholders)

PetExec rows with blank or `Not Assigned` kennel are mapped to synthetic rooms (`wing = import_placeholder`, `room_number` like `UNK-STD`, `UNK-DLX`, …) inferred from kennel text or night-detail tier.

1. Apply migration `supabase/migrations/20260521210000_import_placeholder_rooms.sql` (adds enum value + seeds UNK-* rooms).
2. Re-run validate → generate; more past/ongoing rows should land in `safe_import_payload` with `uses_placeholder_room = true`.
3. In **Boarding** calendar, placeholder rows appear in the amber **Unknown kennel** section at the bottom; open a booking → **Assign real room** when a real kennel is known.
4. Occupancy % excludes placeholder rooms; the report shows a separate “imported on unknown tier” count.

### Stay period (past / ongoing / future)

Each boarding row gets `stay_period` relative to the import run date:

| Period | Meaning |
|--------|---------|
| `past` | Check-out on or before today |
| `ongoing` | Checked in, not yet checked out |
| `future` | Check-in after today |

Most **manual-review boarding** rows are **past** or **ongoing** stays that already matched customer + pet but have no room on the deposit export (`historical_needs_room`). They are historical calendar backfill, not bad name matches. Outputs are split:

- `manual_review_boarding_past.csv`
- `manual_review_boarding_ongoing.csv`
- `manual_review_boarding_future.csv`

Room text is enriched from `msh_boarding_pet_night_detail_*` → `calendar_room_enriched` (not `Calendar_Raw`).

## Manual review workflow

1. Open `output/manual_review_customers.csv` — resolve owner, set `msh_customer_id` in staging (or fix source email/phone), re-run from `match_msh_pets.py`.
2. Open `output/manual_review_pets.csv` — link pet on customer profile, re-run `match_msh_pets.py` → `validate` → `generate`.
3. Open `output/manual_review_boarding_rows.csv` — assign room in MSH UI or improve kennel mapping; for meds use `stay_medications` or append dated notes manually.
4. `output/blocked_rows.csv` — do not import unless data is corrected and flags cleared.

## Dry-run (default)

Steps 1–5 write to `staging/` and `output/` only. **No database writes.**

```bash
python scripts/generate_msh_boarding_payload.py
```

Review:

- `output/import_summary.md`
- `output/safe_import_payload.csv`
- `output/safe_import_payload.json`

## Apply command

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env` (anon key is blocked by RLS for bulk owner reads).

```bash
python scripts/generate_msh_boarding_payload.py --apply
```

Behaviour:

- Inserts **only** safe payload rows
- Skips bookings already in DB (same PetExec `boarding_id` in notes, or same owner + pet + dates)
- Appends manifest at `output/apply_manifest.json`
- **Non-destructive:** no updates to existing bookings or pet profile notes

## Rollback / safety

- No automatic deletes or note overwrites.
- Applied booking IDs are listed in `output/apply_manifest.json`.
- To roll back a bad apply, cancel/delete those bookings in the MSH admin UI (or SQL by manifest IDs).
- Re-running the pipeline is idempotent: existing rows are skipped on `--apply`.

## Verify in MSH

1. **Boarding** calendar — filter check-in range; confirm stays; amber rows = tier placeholders pending real room assignment.
2. **Customers & Pets** — spot-check matched owners/pets from `matched_*.csv`.
3. **Service check-ins** — upcoming check-ins for imported dates.
4. Compare counts in `output/import_summary.md` vs PetExec (optional: `msh_boarding_pets_per_night_view_*` for night totals only).

## Environment

```env
VITE_SUPABASE_URL=https://pfrbeiwqbjcexwjfekwn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

`VITE_SUPABASE_PUBLISHABLE_KEY` alone is insufficient for CLI matching (RLS returns zero owners).

## Outputs (`/output`)

| File | Purpose |
|------|---------|
| `matched_customers.csv` | Auto-matched owners |
| `matched_pets.csv` | Auto-matched pets |
| `matched_boarding_import.csv` | Rows with both IDs |
| `manual_review_*.csv` | Human review queues |
| `blocked_rows.csv` | Hard-blocked |
| `safe_import_payload.json` / `.csv` | Ready to `--apply` |
| `manual_review_boarding_past.csv` | Matched IDs, past stay, needs room |
| `manual_review_boarding_ongoing.csv` | Matched IDs, in-house now, needs room |
| `manual_review_boarding_future.csv` | Upcoming stays needing room assignment |
| `import_summary.md` | Counts and gates |
