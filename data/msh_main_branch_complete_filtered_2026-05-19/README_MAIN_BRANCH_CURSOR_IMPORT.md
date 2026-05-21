# Main Branch only MSH boarding import package

This package is filtered for the main branch system only. Little Gems rows are excluded. Do not use this package for Little Gems imports.

## Files to load into Cursor

1. `msh_customer_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv` -> staging table `stg_customers`
2. `msh_pet_profile_match_template_MAIN_BRANCH_ONLY_2026-05-19.csv` -> staging table `stg_pets`
3. `msh_import_view_MAIN_BRANCH_ONLY_2026-05-19.csv` -> staging table `stg_boarding_import`
4. `msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv` -> optional occupancy/pet-night detail
5. `msh_boarding_pets_per_night_view_MAIN_BRANCH_ONLY_2026-05-19.csv` -> optional sanity-check summary only

## Excluded

- Little Gems rows
- Dashboard/count sheets
- Number of boarding sheet
- Calendar_Raw as an import source
- `total_boarding_pets` and `little_gems` columns from the per-night view

## Primary import source

Use `msh_import_view_MAIN_BRANCH_ONLY_2026-05-19.csv` as the primary import staging source.

## Recommended import order and rules

1. Import `msh_customer_match_template_2026-05-19.csv` into a staging table `stg_customers`.
2. Import `msh_pet_profile_match_template_2026-05-19.csv` into `stg_pets`.
3. Import `msh_import_view_2026-05-19.csv` into `stg_boarding_import`.
4. Match customers to your MSH database:
   - Exact email first.
   - Phone match second using digit-only phone values. For UAE-style numbers, compare both full digits and last 9 digits.
   - Fuzzy owner-name match only after exact email/phone fail.
5. Match pets inside matched customers:
   - Exact normalized pet name.
   - Then fuzzy pet name if needed.
   - Never match a pet name across unrelated customers unless manually reviewed.
6. Fill `msh_customer_id`, `msh_pet_id`, and `msh_match_status` in staging.
7. Filter `DQ_Review` / `stg_boarding_import`:
   - Critical: vaccine expired, duplicate same pet/dates, missing contact.
   - High: vaccine expiring soon, unknown kennel.
   - Medium: missing feeding instructions.
8. Import/upsert only rows with `import_action` explicitly set after review.

## Match columns

Customer match:
- `email`
- `phone_digits`
- `owner_name_norm`
- `customer_key` from Customers sheet

Pet match:
- `pet_name_norm`
- `pet_profile_key`
- `source_match_key`

Booking upsert:
- `boarding_id` when present.
- Otherwise `msh_pet_id + start_date + end_date`.

## Safe overwrite policy

Do not auto-overwrite non-blank MSH notes. Use append-only notes for:
- `feeding_instructions`
- `medication_detail`
- `special_requirements`
- `pet_notes`
- `brought_items`

Medication rows should always be manual-review unless your MSH schema has a proper medication schedule table.

## Example SQL matching shape

```sql
-- 1) Exact email customer matches
update stg_customers sc
set msh_customer_id = c.id,
    msh_match_status = 'exact_email'
from customers c
where lower(trim(sc.email)) = lower(trim(c.email))
  and sc.email <> ''
  and sc.msh_customer_id is null;

-- 2) Phone match using last 9 digits
update stg_customers sc
set msh_customer_id = c.id,
    msh_match_status = 'phone_last9'
from customers c
where right(regexp_replace(sc.phone_digits, '\\D', '', 'g'), 9)
    = right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 9)
  and sc.phone_digits <> ''
  and sc.msh_customer_id is null;

-- 3) Pet exact name match within matched customer
update stg_pets sp
set msh_customer_id = sc.msh_customer_id,
    msh_pet_id = p.id,
    msh_match_status = 'exact_pet_name'
from stg_customers sc
join pets p
  on p.customer_id = sc.msh_customer_id
where sp.customer_key = sc.customer_key
  and lower(regexp_replace(sp.pet_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(p.name, '[^a-z0-9]+', '', 'g'))
  and sp.msh_pet_id is null;

-- 4) Push IDs to import view
update stg_boarding_import sbi
set msh_customer_id = sp.msh_customer_id,
    msh_pet_id = sp.msh_pet_id,
    msh_match_status = sp.msh_match_status
from stg_pets sp
where sbi.source_match_key = sp.pet_profile_key
   or (
      sbi.owner_name = sp.owner_name
      and sbi.pet_name_norm = sp.pet_name_norm
   );
```

Adjust table/column names to your actual MSH schema.

## Suggested Cursor prompt

Use this prompt in Cursor after adding the CSVs and your MSH schema:

> I have staging CSVs for boarding import. Build an idempotent importer that matches customers by email, then phone last 9 digits, then manual-review fuzzy owner name. Match pets only within matched customers by normalized pet name. Upsert boarding records by boarding_id when present, else by pet_id/start_date/end_date. Do not overwrite non-blank care notes; append dated notes. Block rows with vaccine_expired or duplicate_same_pet_dates unless manually approved. Create a report of unmatched customers, unmatched pets, missing feeding instructions, unknown kennels, vaccine issues, and duplicate same pet/date records.
