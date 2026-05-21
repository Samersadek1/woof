-- VacciCheck location/clinic note on pets.
-- Apply via: supabase db push / migrate, or paste into Dashboard → SQL Editor.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_performed_at text;

COMMENT ON COLUMN public.pets.vaccicheck_performed_at IS 'Clinic or location where VacciCheck / titre serology was performed';
