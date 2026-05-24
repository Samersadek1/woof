-- Phase 5a Step 2 — backfill legacy pet note columns from canonical triplet
-- Run VERIFY first; one transaction.

-- VERIFY: expect 11 columns listed
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pets'
  AND column_name IN (
    'behaviour_notes', 'feeding_notes', 'medication_notes',
    'behavioural_notes', 'feeding_instructions', 'medications',
    'medical_conditions', 'medical_notes', 'grooming_notes', 'other_notes', 'assessment_notes'
  )
ORDER BY column_name;

BEGIN;

UPDATE pets SET
  behavioural_notes    = COALESCE(behavioural_notes,    behaviour_notes),
  feeding_instructions = COALESCE(feeding_instructions, feeding_notes),
  medications          = COALESCE(medications,          medication_notes)
WHERE behaviour_notes IS NOT NULL
   OR feeding_notes  IS NOT NULL
   OR medication_notes IS NOT NULL;

-- POST-CHECK: expect ~1,307 behaviour, ~1,315 feeding, ~462 medication
SELECT
  COUNT(*) FILTER (WHERE behavioural_notes IS NOT NULL)    AS legacy_behaviour,
  COUNT(*) FILTER (WHERE feeding_instructions IS NOT NULL) AS legacy_feeding,
  COUNT(*) FILTER (WHERE medications IS NOT NULL)          AS legacy_medication,
  COUNT(*) FILTER (WHERE behaviour_notes IS NOT NULL)      AS canonical_behaviour,
  COUNT(*) FILTER (WHERE feeding_notes IS NOT NULL)        AS canonical_feeding,
  COUNT(*) FILTER (WHERE medication_notes IS NOT NULL)      AS canonical_medication
FROM pets;

COMMIT;
