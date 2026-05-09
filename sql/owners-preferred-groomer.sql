-- Preferred groomer on customer profile (used to pre-fill new grooming appointments)
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS preferred_groomer TEXT;
