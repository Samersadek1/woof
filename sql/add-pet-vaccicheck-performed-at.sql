-- VacciCheck performed-at location/clinic on pets.
-- Run in Supabase SQL Editor if saving "VacciCheck performed at" fails.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_performed_at text;

COMMENT ON COLUMN public.pets.vaccicheck_performed_at IS 'Clinic or location where VacciCheck / titre serology was performed';

NOTIFY pgrst, 'reload schema';

SELECT 'pets.vaccicheck_performed_at column applied' AS status;
