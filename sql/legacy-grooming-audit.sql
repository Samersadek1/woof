-- Read-only audit: legacy grooming keys in service_rates and invoice_line_items
-- Run in Supabase SQL editor. Paste results into docs/REFACTOR_LEDGER.md

-- 1) service_rates rows that look like legacy display keys (not enum service_code values)
SELECT service_code::text AS service_code,
       pet_size::text,
       coat_type::text,
       season::text,
       amount_aed,
       is_active,
       updated_at
FROM service_rates
WHERE service_code::text LIKE 'grooming_grande%'
   OR service_code::text IN (
        'grooming_full_bath',
        'grooming_nail_clip',
        'grooming_pawdicure',
        'grooming_deshed_smooth_s',
        'grooming_deshed_smooth_m',
        'grooming_deshed_smooth_l'
      )
ORDER BY 1, 2, 3, 4;

-- 2) v2-style grooming_full_service rows (canonical)
SELECT service_code::text,
       pet_size::text,
       coat_type::text,
       season::text,
       amount_aed,
       is_active,
       updated_at
FROM service_rates
WHERE service_code::text IN (
  'grooming_full_service',
  'grooming_bath_brush_tidy',
  'grooming_hair_no_more',
  'grooming_splash',
  'grooming_nail_ear_teeth'
)
ORDER BY 1, 2, 3, 4;

-- 3) Invoice line items still storing legacy pricing_key
SELECT pricing_key, COUNT(*) AS cnt
FROM invoice_line_items
WHERE pricing_key IS NOT NULL
  AND pricing_key LIKE 'grooming_%'
GROUP BY 1
ORDER BY cnt DESC;

-- 4) Boarding add-on keys on invoices (keep until migrated)
SELECT pricing_key, COUNT(*) AS cnt
FROM invoice_line_items
WHERE pricing_key LIKE 'boarding_addon_%'
GROUP BY 1
ORDER BY cnt DESC
LIMIT 50;
