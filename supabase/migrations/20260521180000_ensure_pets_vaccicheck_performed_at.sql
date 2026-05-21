-- Idempotent: ensure pets.vaccicheck_performed_at exists.
-- Fixes save errors when "VacciCheck performed at" was added in the app before the column existed in Supabase.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_performed_at text;

COMMENT ON COLUMN public.pets.vaccicheck_performed_at IS 'Clinic or location where VacciCheck / titre serology was performed';

NOTIFY pgrst, 'reload schema';
