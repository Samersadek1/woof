-- Hourly daycare rate card keys (idempotent upsert).
-- Run against production in Supabase Dashboard → SQL Editor, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/pricing-daycare-hourly-upsert.sql

INSERT INTO pricing (key, amount_aed, label, category) VALUES
  ('daycare_hourly_single_day',     38.50, 'Daycare Hourly — 1 Dog',                  'daycare'),
  ('daycare_hourly_2_dogs',         57.75, 'Daycare Hourly — 2 Dogs',                 'daycare'),
  ('daycare_hourly_3_dogs',         77.00, 'Daycare Hourly — 3 Dogs',                 'daycare'),
  ('daycare_hourly_family_per_dog', 29.00, 'Daycare Hourly — Family rate / dog (4+)', 'daycare'),
  ('daycare_hourly_4_dogs',        116.00, 'Daycare Hourly — 4 Dogs',                 'daycare'),
  ('daycare_hourly_5_dogs',        145.00, 'Daycare Hourly — 5 Dogs',                 'daycare'),
  ('daycare_hourly_6_dogs',        174.00, 'Daycare Hourly — 6 Dogs',                 'daycare')
ON CONFLICT (key) DO UPDATE
SET amount_aed = EXCLUDED.amount_aed,
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    updated_at = NOW();
