-- Add standalone "Tidy" grooming service (face/paws/sanitary tidy without full bath).

DO $$ BEGIN
  ALTER TYPE public.grooming_service ADD VALUE 'tidy';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.service_code ADD VALUE 'grooming_tidy';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.service_code_meta (service_code, display_name, unit, applicable_species, description)
VALUES (
  'grooming_tidy',
  'Tidy',
  'each',
  ARRAY['dog']::species[],
  'Face, paws, and sanitary tidy'
)
ON CONFLICT (service_code) DO NOTHING;

-- Default durations (minutes) by dog size — adjust in ops if needed.
INSERT INTO public.grooming_service_durations (service, size, default_minutes) VALUES
  ('tidy', 'small', 20),
  ('tidy', 'medium', 25),
  ('tidy', 'large', 30)
ON CONFLICT (service, size) DO NOTHING;

-- Verification (paste after apply):
-- SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
--   WHERE t.typname = 'grooming_service' ORDER BY e.enumsortorder;
-- SELECT service_code, display_name FROM service_code_meta WHERE service_code = 'grooming_tidy';
-- SELECT * FROM grooming_service_durations WHERE service = 'tidy' ORDER BY size;
