BEGIN;

-- ============================================================
-- 1. Enums (defensive — create if missing, add values if partial)
-- ============================================================

-- grooming_package enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grooming_package') THEN
    CREATE TYPE grooming_package AS ENUM (
      'grande', 'bijoux', 'deshedding_long', 'deshedding_smooth', 'bath_blow'
    );
  ELSE
    BEGIN ALTER TYPE grooming_package ADD VALUE IF NOT EXISTS 'grande'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE grooming_package ADD VALUE IF NOT EXISTS 'bijoux'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE grooming_package ADD VALUE IF NOT EXISTS 'deshedding_long'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE grooming_package ADD VALUE IF NOT EXISTS 'deshedding_smooth'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE grooming_package ADD VALUE IF NOT EXISTS 'bath_blow'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- pet_size_category enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pet_size_category') THEN
    CREATE TYPE pet_size_category AS ENUM ('S', 'M', 'L', 'XL');
  ELSE
    BEGIN ALTER TYPE pet_size_category ADD VALUE IF NOT EXISTS 'S'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE pet_size_category ADD VALUE IF NOT EXISTS 'M'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE pet_size_category ADD VALUE IF NOT EXISTS 'L'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE pet_size_category ADD VALUE IF NOT EXISTS 'XL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- ============================================================
-- 2. Table: grooming_package_rates
-- ============================================================

CREATE TABLE IF NOT EXISTS grooming_package_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package grooming_package NOT NULL,
  size pet_size_category NOT NULL,
  amount_aed NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE (package, size)
);

CREATE INDEX IF NOT EXISTS idx_grooming_package_rates_lookup
  ON grooming_package_rates (package, size);

DROP TRIGGER IF EXISTS trg_grooming_package_rates_updated_at ON grooming_package_rates;
CREATE TRIGGER trg_grooming_package_rates_updated_at
  BEFORE UPDATE ON grooming_package_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. Seed the 20-cell grid
-- ============================================================

INSERT INTO grooming_package_rates (package, size, amount_aed) VALUES
  ('grande', 'S', 0),
  ('grande', 'M', 0),
  ('grande', 'L', 0),
  ('grande', 'XL', 0),
  ('bijoux', 'S', 0),
  ('bijoux', 'M', 0),
  ('bijoux', 'L', 0),
  ('bijoux', 'XL', 0),
  ('deshedding_long', 'S', 0),
  ('deshedding_long', 'M', 0),
  ('deshedding_long', 'L', 0),
  ('deshedding_long', 'XL', 0),
  ('deshedding_smooth', 'S', 0),
  ('deshedding_smooth', 'M', 0),
  ('deshedding_smooth', 'L', 0),
  ('deshedding_smooth', 'XL', 0),
  ('bath_blow', 'S', 0),
  ('bath_blow', 'M', 0),
  ('bath_blow', 'L', 0),
  ('bath_blow', 'XL', 0)
ON CONFLICT (package, size) DO NOTHING;

-- ============================================================
-- 4. Resolver RPC: resolve_grooming_price
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_grooming_price(
  p_package grooming_package,
  p_size pet_size_category,
  p_quantity NUMERIC DEFAULT 1,
  p_tier TEXT DEFAULT 'standard'
)
RETURNS TABLE (
  unit_price NUMERIC,
  discount_pct NUMERIC,
  discount_amount NUMERIC,
  subtotal NUMERIC,
  vat NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_unit NUMERIC;
  v_pct NUMERIC;
  v_gross NUMERIC;
  v_disc NUMERIC;
  v_sub NUMERIC;
  v_vat NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT amount_aed INTO v_unit
  FROM grooming_package_rates
  WHERE package = p_package AND size = p_size;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'No grooming rate configured for package=% size=%', p_package, p_size;
  END IF;

  v_pct := tier_discount_pct(p_tier);
  v_gross := v_unit * p_quantity;
  v_disc := ROUND(v_gross * v_pct / 100.0, 2);
  v_sub := v_gross - v_disc;
  v_vat := ROUND(v_sub * 0.05, 2);
  v_total := v_sub + v_vat;

  RETURN QUERY SELECT v_unit, v_pct, v_disc, v_sub, v_vat, v_total;
END;
$$;

COMMIT;
