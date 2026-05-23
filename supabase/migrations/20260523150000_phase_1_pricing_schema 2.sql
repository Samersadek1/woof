BEGIN;

-- ============================================================
-- A. DROP MSH PRICING STRUCTURES
-- ============================================================
DROP FUNCTION IF EXISTS get_price CASCADE;
DROP TABLE IF EXISTS grooming_package_rates CASCADE;
DROP TABLE IF EXISTS grooming_service_rates CASCADE;
DROP TABLE IF EXISTS addon_rates CASCADE;
DROP TABLE IF EXISTS pricing CASCADE;

ALTER TABLE pets DROP COLUMN IF EXISTS size_category;
DROP TYPE IF EXISTS pet_size_category;

-- ============================================================
-- B. NEW ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE rate_season AS ENUM ('peak','off_peak');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pet_size AS ENUM ('small','medium','large');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coat_type AS ENUM ('short','mid_length','long');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_unit AS ENUM
    ('per_night','per_day','per_hour','per_half_hour','per_session','each');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_code AS ENUM (
    'boarding_night',
    'daycare_full_day',
    'daycare_hourly',
    'grooming_full_service',
    'cat_grooming_full_no_bath',
    'cat_grooming_full_with_bath',
    'grooming_bath_brush_tidy',
    'grooming_nail_ear_teeth',
    'cat_grooming_nail_ear',
    'grooming_hair_no_more',
    'cat_grooming_hair_no_more',
    'grooming_splash',
    'cat_grooming_splash',
    'addon_nails',
    'addon_glands',
    'addon_dematting',
    'addon_teeth_cleaning',
    'addon_flea_tick_bath',
    'addon_specialised_shampoo',
    'treadmill_daycare_addon',
    'treadmill_hourly_addon',
    'assessment_with_first_hour'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- C. NEW TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS service_code_meta (
  service_code service_code PRIMARY KEY,
  display_name text NOT NULL,
  unit service_unit NOT NULL,
  applicable_species species[] NOT NULL,
  vat_included boolean NOT NULL DEFAULT true,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS peak_periods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  label text NOT NULL,
  start_month int NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_day int NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  end_month int NOT NULL CHECK (end_month BETWEEN 1 AND 12),
  end_day int NOT NULL CHECK (end_day BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_rates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_code service_code NOT NULL REFERENCES service_code_meta(service_code),
  pet_size pet_size,
  coat_type coat_type,
  season rate_season,
  amount_aed numeric(10,2) NOT NULL CHECK (amount_aed >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Composite uniqueness across dimensions (NULLS NOT DISTINCT: PG15+ treats NULLs as equal)
CREATE UNIQUE INDEX IF NOT EXISTS service_rate_dimensions_unique
  ON service_rates (service_code, pet_size, coat_type, season)
  NULLS NOT DISTINCT
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_rates_lookup
  ON service_rates (service_code, pet_size, coat_type, season)
  WHERE is_active = true;

-- ============================================================
-- D. RLS — read access for authenticated, writes via service_role only
-- ============================================================
ALTER TABLE service_code_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE peak_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_rates     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_code_meta_read" ON service_code_meta;
CREATE POLICY "service_code_meta_read" ON service_code_meta
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "peak_periods_read" ON peak_periods;
CREATE POLICY "peak_periods_read" ON peak_periods
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_rates_read" ON service_rates;
CREATE POLICY "service_rates_read" ON service_rates
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- E. PETS — new columns
-- ============================================================
ALTER TABLE pets ADD COLUMN IF NOT EXISTS size pet_size;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS coat_type coat_type;

-- ============================================================
-- F. HELPER + RESOLVER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION is_peak_date(p_date date)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  pp record;
  d_month int := EXTRACT(MONTH FROM p_date)::int;
  d_day   int := EXTRACT(DAY   FROM p_date)::int;
BEGIN
  FOR pp IN
    SELECT start_month, start_day, end_month, end_day
    FROM peak_periods WHERE is_active
  LOOP
    IF pp.start_month <= pp.end_month THEN
      -- Range within a single calendar year
      IF (d_month > pp.start_month
          OR (d_month = pp.start_month AND d_day >= pp.start_day))
        AND
         (d_month < pp.end_month
          OR (d_month = pp.end_month AND d_day <= pp.end_day))
      THEN RETURN true; END IF;
    ELSE
      -- Range crosses year boundary (e.g. Dec 20 – Jan 8)
      IF (d_month > pp.start_month
          OR (d_month = pp.start_month AND d_day >= pp.start_day))
       OR (d_month < pp.end_month
          OR (d_month = pp.end_month AND d_day <= pp.end_day))
      THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION resolve_woof_service_rate(
  p_service_code service_code,
  p_pet_size     pet_size DEFAULT NULL,
  p_coat_type    coat_type DEFAULT NULL,
  p_booking_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rate_id        uuid,
  service_code   service_code,
  amount_aed     numeric,
  unit           service_unit,
  matched_season rate_season,
  is_peak        boolean,
  notes          text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_is_peak boolean;
  v_season  rate_season;
BEGIN
  v_is_peak := is_peak_date(p_booking_date);
  v_season  := CASE WHEN v_is_peak THEN 'peak'::rate_season
                    ELSE 'off_peak'::rate_season END;

  RETURN QUERY
  SELECT
    sr.id,
    sr.service_code,
    sr.amount_aed,
    scm.unit,
    sr.season,
    v_is_peak,
    sr.notes
  FROM service_rates sr
  JOIN service_code_meta scm USING (service_code)
  WHERE sr.service_code = p_service_code
    AND sr.is_active
    AND (sr.pet_size  IS NULL OR sr.pet_size  = p_pet_size)
    AND (sr.coat_type IS NULL OR sr.coat_type = p_coat_type)
    AND (sr.season    IS NULL OR sr.season    = v_season)
    AND (sr.effective_from IS NULL OR sr.effective_from <= p_booking_date)
    AND (sr.effective_to   IS NULL OR sr.effective_to   >= p_booking_date)
  ORDER BY
    (sr.pet_size  IS NOT NULL)::int DESC,
    (sr.coat_type IS NOT NULL)::int DESC,
    (sr.season    IS NOT NULL)::int DESC
  LIMIT 1;
END $$;

-- ============================================================
-- G. SEED service_code_meta (22 rows)
-- ============================================================
INSERT INTO service_code_meta (service_code, display_name, unit, applicable_species, description) VALUES
  ('boarding_night',              'Boarding (per night)',               'per_night',     ARRAY['dog']::species[],         'Overnight boarding incl. supervised daycare, dry food, daily wellness'),
  ('daycare_full_day',            'Daycare Full Day',                   'per_day',       ARRAY['dog']::species[],         'Mon-Sat 7am-7pm'),
  ('daycare_hourly',              'Daycare Hourly',                     'per_hour',      ARRAY['dog']::species[],         'Min 3 hours weekdays; Sunday 12-5pm hourly only'),
  ('grooming_full_service',       'Full Service Grooming',              'each',          ARRAY['dog']::species[],         'Shampoo, condition, haircut, blow dry, brush, nails, ears'),
  ('cat_grooming_full_no_bath',   'Cat Full Service (no bath)',         'each',          ARRAY['cat']::species[],         'Short hair only'),
  ('cat_grooming_full_with_bath', 'Cat Full Service (with bath)',       'each',          ARRAY['cat']::species[],         NULL),
  ('grooming_bath_brush_tidy',    'Bath, Brush & Tidy',                 'each',          ARRAY['dog']::species[],         'Bath, brush, face/paws/sanitary tidy, nails, ears'),
  ('grooming_nail_ear_teeth',     'Nail, Ear & Teeth Care',             'each',          ARRAY['dog']::species[],         'Nails, ear cleaning, teeth brushing'),
  ('cat_grooming_nail_ear',       'Cat Nail & Ear Care',                'each',          ARRAY['cat']::species[],         'Excludes teeth'),
  ('grooming_hair_no_more',       'Hair-No-More (anti-shedding)',       'each',          ARRAY['dog']::species[],         'FURminator anti-shedding'),
  ('cat_grooming_hair_no_more',   'Cat Hair-No-More',                   'each',          ARRAY['cat']::species[],         'FURminator anti-shedding'),
  ('grooming_splash',             'Splash',                             'each',          ARRAY['dog']::species[],         'Bath, brush, nails, ears, sanitary tidy'),
  ('cat_grooming_splash',         'Cat Splash',                         'each',          ARRAY['cat']::species[],         NULL),
  ('addon_nails',                 'Nail Trim (add-on)',                 'each',          ARRAY['dog','cat']::species[],   NULL),
  ('addon_glands',                'Glands (add-on)',                    'each',          ARRAY['dog']::species[],         'Only available with a bath service'),
  ('addon_dematting',             'Dematting',                          'per_half_hour', ARRAY['dog','cat']::species[],   NULL),
  ('addon_teeth_cleaning',        'Teeth Cleaning (add-on)',            'each',          ARRAY['dog']::species[],         NULL),
  ('addon_flea_tick_bath',        'Flea/Tick Bath',                     'each',          ARRAY['dog','cat']::species[],   'Includes tick removal'),
  ('addon_specialised_shampoo',   'Specialised Shampoo (add-on)',       'each',          ARRAY['dog','cat']::species[],   'Hypoallergenic or flea & tick'),
  ('treadmill_daycare_addon',     'Treadmill (daycare package add-on)', 'per_session',   ARRAY['dog']::species[],         'Must be purchased w/ daycare package; 20-60kg only'),
  ('treadmill_hourly_addon',      'Treadmill (hourly add-on)',          'per_session',   ARRAY['dog']::species[],         '20-60kg only'),
  ('assessment_with_first_hour',  'Assessment + 1hr Daycare',           'each',          ARRAY['dog']::species[],         'Mon-Fri 10am-3pm; gate for daycare/boarding')
ON CONFLICT (service_code) DO NOTHING;

-- ============================================================
-- H. SEED peak_periods (2 rows)
-- ============================================================
INSERT INTO peak_periods (label, start_month, start_day, end_month, end_day, notes) VALUES
  ('Summer Peak',            7,  1, 9, 1,  'Annual: July 1 – September 1'),
  ('Christmas/NY Peak',     12, 20, 1, 8,  'Annual: December 20 – January 8 (year-spanning)')
ON CONFLICT DO NOTHING;

-- ============================================================
-- I. SEED service_rates (36 rows from 2025 pricelist)
-- ============================================================

-- Boarding (2 rows: peak / non-peak)
INSERT INTO service_rates (service_code, season, amount_aed) VALUES
  ('boarding_night', 'peak',     127.50),
  ('boarding_night', 'off_peak', 115.50);

-- Daycare (2 rows, flat)
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('daycare_full_day', 105.00),
  ('daycare_hourly',    10.50);

-- Grooming Full Service — Dog (3 rows by pet_size)
INSERT INTO service_rates (service_code, pet_size, amount_aed) VALUES
  ('grooming_full_service', 'small',  210.00),
  ('grooming_full_service', 'medium', 236.25),
  ('grooming_full_service', 'large',  262.50);

-- Cat Full Service (3 rows: no-bath short, with-bath short, with-bath long)
INSERT INTO service_rates (service_code, coat_type, amount_aed) VALUES
  ('cat_grooming_full_no_bath',   'short', 157.50),
  ('cat_grooming_full_with_bath', 'short', 210.00),
  ('cat_grooming_full_with_bath', 'long',  315.00);

-- Bath, Brush & Tidy — Dog (3 rows by pet_size)
INSERT INTO service_rates (service_code, pet_size, amount_aed) VALUES
  ('grooming_bath_brush_tidy', 'small',  131.25),
  ('grooming_bath_brush_tidy', 'medium', 157.50),
  ('grooming_bath_brush_tidy', 'large',  210.00);

-- Nail, Ear, Teeth Care (2 rows — dog flat, cat flat)
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('grooming_nail_ear_teeth', 52.50),
  ('cat_grooming_nail_ear',   36.75);

-- Hair-No-More — Dog (3 rows by coat_type) + Cat (1 flat)
INSERT INTO service_rates (service_code, coat_type, amount_aed) VALUES
  ('grooming_hair_no_more', 'short',      210.00),
  ('grooming_hair_no_more', 'mid_length', 262.50),
  ('grooming_hair_no_more', 'long',       315.00);
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('cat_grooming_hair_no_more', 262.50);

-- Splash — Dog (6 rows: 3 sizes × 2 coats) + Cat (2 rows by coat)
INSERT INTO service_rates (service_code, pet_size, coat_type, amount_aed) VALUES
  ('grooming_splash', 'small',  'short', 105.00),
  ('grooming_splash', 'small',  'long',  131.25),
  ('grooming_splash', 'medium', 'short', 131.25),
  ('grooming_splash', 'medium', 'long',  141.75),
  ('grooming_splash', 'large',  'short', 152.25),
  ('grooming_splash', 'large',  'long',  157.50);
INSERT INTO service_rates (service_code, coat_type, amount_aed) VALUES
  ('cat_grooming_splash', 'short', 131.25),
  ('cat_grooming_splash', 'long',  157.50);

-- Add-ons (6 rows, flat)
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('addon_nails',              36.75),
  ('addon_glands',             36.75),
  ('addon_dematting',          52.50),
  ('addon_teeth_cleaning',     36.75),
  ('addon_flea_tick_bath',     52.50),
  ('addon_specialised_shampoo', 10.00);

-- Treadmill (2 rows)
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('treadmill_daycare_addon', 31.50),
  ('treadmill_hourly_addon',  36.75);

-- Assessment (1 row)
INSERT INTO service_rates (service_code, amount_aed) VALUES
  ('assessment_with_first_hour', 52.50);

-- ============================================================
-- J. VERIFICATION
-- ============================================================
DO $$
DECLARE
  meta_rows  int;
  rate_rows  int;
  peak_rows  int;
BEGIN
  SELECT COUNT(*) INTO meta_rows FROM service_code_meta;
  SELECT COUNT(*) INTO rate_rows FROM service_rates;
  SELECT COUNT(*) INTO peak_rows FROM peak_periods;

  IF meta_rows <> 22 THEN RAISE EXCEPTION 'Expected 22 service_code_meta rows, got %', meta_rows; END IF;
  IF rate_rows <> 36 THEN RAISE EXCEPTION 'Expected 36 service_rates rows, got %', rate_rows; END IF;
  IF peak_rows <> 2  THEN RAISE EXCEPTION 'Expected 2 peak_periods rows, got %', peak_rows; END IF;

  -- Smoke test the resolver
  PERFORM * FROM resolve_woof_service_rate('boarding_night', NULL, NULL, '2026-07-15'::date);
  PERFORM * FROM resolve_woof_service_rate('grooming_full_service', 'medium', NULL, CURRENT_DATE);
  PERFORM * FROM resolve_woof_service_rate('grooming_splash', 'large', 'long', CURRENT_DATE);
  PERFORM * FROM resolve_woof_service_rate('cat_grooming_splash', NULL, 'short', CURRENT_DATE);
  PERFORM * FROM resolve_woof_service_rate('addon_nails', NULL, NULL, CURRENT_DATE);
END $$;

COMMIT;
