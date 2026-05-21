-- Idempotent: ensure all VacciCheck / titre columns exist on pets.
-- The original fields lived only in sql/add-pet-vaccicheck-columns.sql and were often never applied.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_report_url text,
  ADD COLUMN IF NOT EXISTS vaccicheck_test_date date,
  ADD COLUMN IF NOT EXISTS vaccicheck_distemper_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_parvovirus_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_hepatitis_tier text,
  ADD COLUMN IF NOT EXISTS vaccicheck_immunity_rating text,
  ADD COLUMN IF NOT EXISTS vaccicheck_performed_at text;

COMMENT ON COLUMN public.pets.vaccicheck_report_url IS 'Public URL of uploaded VacciCheck / titre report (PDF or image)';
COMMENT ON COLUMN public.pets.vaccicheck_test_date IS 'Date blood sample was taken / reported';
COMMENT ON COLUMN public.pets.vaccicheck_distemper_tier IS 'Titre class e.g. S0–S6';
COMMENT ON COLUMN public.pets.vaccicheck_parvovirus_tier IS 'Titre class e.g. S0–S6';
COMMENT ON COLUMN public.pets.vaccicheck_hepatitis_tier IS 'Titre class e.g. S0–S6 (adenovirus/hepatitis)';
COMMENT ON COLUMN public.pets.vaccicheck_immunity_rating IS 'Overall interpretation e.g. Good immunity';
COMMENT ON COLUMN public.pets.vaccicheck_performed_at IS 'Clinic or location where VacciCheck / titre serology was performed';

NOTIFY pgrst, 'reload schema';
