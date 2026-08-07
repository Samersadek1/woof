-- Standalone "Anal gland expansion" bookable service (AED 52.50).
-- Distinct from addon_glands (AED 36.75), which remains the grooming add-on rate.
-- Enum additions are separate statements (idempotent) before use.

DO $$ BEGIN
  ALTER TYPE public.grooming_service ADD VALUE 'gland_expression';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.service_code ADD VALUE 'grooming_gland_expression';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.service_code_meta (service_code, display_name, unit, applicable_species, description)
VALUES (
  'grooming_gland_expression',
  'Anal gland expansion',
  'each',
  ARRAY['dog']::species[],
  'Standalone anal gland expansion (not the grooming add-on)'
)
ON CONFLICT (service_code) DO NOTHING;

INSERT INTO public.service_rates (service_code, amount_aed, is_active, notes)
SELECT
  'grooming_gland_expression'::public.service_code,
  52.50,
  true,
  'Standalone anal gland expansion'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_rates sr
  WHERE sr.service_code = 'grooming_gland_expression'::public.service_code
    AND sr.is_active = true
    AND sr.pet_size IS NULL
    AND sr.coat_type IS NULL
    AND sr.season IS NULL
);

INSERT INTO public.grooming_service_durations (service, size, default_minutes) VALUES
  ('gland_expression', 'small', 15),
  ('gland_expression', 'medium', 15),
  ('gland_expression', 'large', 15)
ON CONFLICT (service, size) DO NOTHING;

-- Verification (paste after apply)
SELECT service_code, amount_aed, is_active, notes
FROM public.service_rates
WHERE service_code IN ('addon_glands', 'grooming_gland_expression')
ORDER BY service_code, amount_aed;

SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname IN ('grooming_service', 'service_code')
  AND e.enumlabel IN ('gland_expression', 'grooming_gland_expression')
ORDER BY t.typname, e.enumlabel;
