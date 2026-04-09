-- Other notes: staff/customer context shown on boarding, grooming, park, etc.
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS other_notes text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS other_notes text;

COMMENT ON COLUMN public.owners.other_notes IS 'Shown on booking and appointment views (e.g. handling, preferences)';
COMMENT ON COLUMN public.pets.other_notes IS 'Shown on booking and appointment views for this pet';
