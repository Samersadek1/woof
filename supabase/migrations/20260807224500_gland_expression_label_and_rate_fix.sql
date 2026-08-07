-- Fix display name (Expression not Expansion) and ensure standalone rate 52.50 exists.

UPDATE public.service_code_meta
SET
  display_name = 'Anal Gland Expression',
  description = 'Standalone anal gland expression (not the grooming add-on)'
WHERE service_code = 'grooming_gland_expression';

UPDATE public.service_rates
SET
  amount_aed = 52.50,
  is_active = true,
  notes = 'Standalone anal gland expression',
  updated_at = now()
WHERE service_code = 'grooming_gland_expression'
  AND pet_size IS NULL
  AND coat_type IS NULL
  AND season IS NULL;

INSERT INTO public.service_rates (service_code, amount_aed, is_active, notes)
SELECT
  'grooming_gland_expression'::public.service_code,
  52.50,
  true,
  'Standalone anal gland expression'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_rates sr
  WHERE sr.service_code = 'grooming_gland_expression'::public.service_code
    AND sr.is_active = true
    AND sr.pet_size IS NULL
    AND sr.coat_type IS NULL
    AND sr.season IS NULL
);

NOTIFY pgrst, 'reload schema';

-- Verification
SELECT service_code, amount_aed, is_active, notes
FROM public.service_rates
WHERE service_code IN ('addon_glands', 'grooming_gland_expression')
ORDER BY service_code, amount_aed;

SELECT service_code, display_name
FROM public.service_code_meta
WHERE service_code = 'grooming_gland_expression';
