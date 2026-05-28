-- Optional Phase 6: PREVIEW ONLY — do not DELETE without backup and Samer sign-off
-- Finds potential duplicate grooming rows (legacy display key vs v2 service_code rows)

WITH legacy AS (
  SELECT id,
         service_code::text AS code,
         pet_size::text AS pet_size,
         coat_type::text AS coat_type,
         amount_aed
  FROM service_rates
  WHERE service_code::text LIKE 'grooming_grande%'
),
v2 AS (
  SELECT id,
         service_code::text AS code,
         pet_size::text AS pet_size,
         coat_type::text AS coat_type,
         amount_aed
  FROM service_rates
  WHERE service_code::text = 'grooming_full_service'
    AND pet_size IS NOT NULL
)
SELECT l.id AS legacy_id,
       l.code AS legacy_code,
       l.pet_size AS legacy_size,
       l.amount_aed AS legacy_aed,
       v.id AS v2_id,
       v.amount_aed AS v2_aed,
       ABS(l.amount_aed - v.amount_aed) AS aed_diff
FROM legacy l
LEFT JOIN v2 v ON v.pet_size = CASE
  WHEN l.code LIKE '%_s' THEN 'small'
  WHEN l.code LIKE '%_m' THEN 'medium'
  WHEN l.code LIKE '%_l' AND l.code NOT LIKE '%_xl' THEN 'large'
  WHEN l.code LIKE '%_xl' THEN 'large'
  ELSE NULL
END
ORDER BY l.code;

-- Verification after any future merge (run manually):
-- SELECT COUNT(*) FROM service_rates WHERE service_code::text LIKE 'grooming_grande%';
