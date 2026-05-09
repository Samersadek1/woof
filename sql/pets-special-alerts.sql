-- Special alert flags for grooming/boarding workflows (JSON on pet record).
-- Run in Supabase SQL editor or: supabase db execute --file sql/pets-special-alerts.sql

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS special_alerts jsonb NULL;

COMMENT ON COLUMN public.pets.special_alerts IS
  'Structured flags: aggressive_muzzle, anxious, medical, elderly (booleans), other_text (string). Null = none.';
