-- Seed pricing rows for every room_type × occupancy combination.
-- Uses each room's nightly_rate as the default. Twin = 1.5×, Multiple = 2×.
-- Safe to run multiple times — ON CONFLICT skips existing keys.

-- Single occupancy (base rate from rooms)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT DISTINCT
  r.room_type::text || '_single'  AS key,
  COALESCE(MAX(r.nightly_rate), 0) AS amount_aed,
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Single)' AS label,
  'boarding' AS category
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Twin occupancy (1.5× base rate)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT DISTINCT
  r.room_type::text || '_twin'  AS key,
  ROUND(COALESCE(MAX(r.nightly_rate), 0) * 1.5) AS amount_aed,
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Twin)' AS label,
  'boarding' AS category
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Multiple occupancy (2× base rate)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT DISTINCT
  r.room_type::text || '_multiple'  AS key,
  ROUND(COALESCE(MAX(r.nightly_rate), 0) * 2) AS amount_aed,
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Multiple)' AS label,
  'boarding' AS category
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Also keep a base key per room_type (no occupancy suffix) as fallback
INSERT INTO pricing (key, amount_aed, label, category)
SELECT DISTINCT
  r.room_type::text              AS key,
  COALESCE(MAX(r.nightly_rate), 0) AS amount_aed,
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) AS label,
  'boarding' AS category
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Common addon/service pricing keys
INSERT INTO pricing (key, amount_aed, label, category) VALUES
  ('transport_dubai',      150, 'Transport Dubai',      'transport'),
  ('transport_abudhabi',   250, 'Transport Abu Dhabi',   'transport'),
  ('grooming_full_groom',  200, 'Full Groom',            'grooming'),
  ('grooming_full_bath',   120, 'Full Bath',             'grooming')
ON CONFLICT (key) DO NOTHING;
