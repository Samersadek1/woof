-- Phase 4: optional deadline for floating grooming jobs. Idempotent.

ALTER TABLE public.grooming_appointments
  ADD COLUMN IF NOT EXISTS must_finish_by timestamptz NULL;

-- Verification:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'grooming_appointments' AND column_name = 'must_finish_by';
