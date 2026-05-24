-- Phase 5a Step 4 — DROP legacy pet note columns
-- ONLY after UI refactor is deployed and POST-CHECK on backfill is stable.

-- VERIFY: legacy columns still exist
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pets'
  AND column_name IN (
    'behavioural_notes', 'feeding_instructions', 'medications',
    'medical_conditions', 'medical_notes', 'other_notes'
  );

BEGIN;

ALTER TABLE pets
  DROP COLUMN IF EXISTS behavioural_notes,
  DROP COLUMN IF EXISTS feeding_instructions,
  DROP COLUMN IF EXISTS medications,
  DROP COLUMN IF EXISTS medical_conditions,
  DROP COLUMN IF EXISTS medical_notes,
  DROP COLUMN IF EXISTS other_notes;

-- POST-CHECK: expect 0 rows
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pets'
  AND column_name IN (
    'behavioural_notes', 'feeding_instructions', 'medications',
    'medical_conditions', 'medical_notes', 'other_notes'
  );

COMMIT;

-- Regenerate types: npx supabase gen types typescript --linked
