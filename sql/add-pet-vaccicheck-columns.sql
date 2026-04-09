-- Vaccicheck (serology titre) fields on pets — run in Supabase SQL Editor once.
-- Stores report file URL + S-class ratings per virus + overall immunity wording.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_report_url text,
  ADD COLUMN IF NOT EXISTS vaccicheck_test_date date,
  ADD COLUMN IF NOT EXISTS vaccicheck_distemper_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_parvovirus_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_hepatitis_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_immunity_rating text;

COMMENT ON COLUMN public.pets.vaccicheck_report_url IS 'Public URL of uploaded VacciCheck / titre report (PDF or image)';
COMMENT ON COLUMN public.pets.vaccicheck_test_date IS 'Date blood sample was taken / reported';
COMMENT ON COLUMN public.pets.vaccicheck_distemper_tier IS 'Titre class e.g. S0–S6';
COMMENT ON COLUMN public.pets.vaccicheck_parvovirus_tier IS 'Titre class e.g. S0–S6';
COMMENT ON COLUMN public.pets.vaccicheck_hepatitis_tier IS 'Titre class e.g. S0–S6 (adenovirus/hepatitis)';
COMMENT ON COLUMN public.pets.vaccicheck_immunity_rating IS 'Overall interpretation e.g. Good immunity';

-- Storage: reports go to bucket `pet-photos` under `vaccicheck/{petId}/`.
-- If upload fails with permission errors, add Storage RLS policies for that prefix
-- (same pattern as `passports/{petId}/` if you use path-based policies).
