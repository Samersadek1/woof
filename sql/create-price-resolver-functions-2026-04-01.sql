-- =============================================================================
-- woof Price Resolver Functions (adapted to current schema)
-- =============================================================================
--
-- Current pricing schema in this repo:
--   pricing(key TEXT PRIMARY KEY, amount_aed NUMERIC, label TEXT, category TEXT)
--
-- Policy:
-- - Base prices are stored in pricing.
-- - Membership discount is applied at calculation/invoice time.
-- - VAT is 5% and applied on discounted subtotal.
-- - Off-peak eligibility:
--     * Jan 15–Jun 15 OR Sep 01–Dec 01
--     * at least 3 nights
--     * UAE holiday/Ramadan overlap exclusion is stubbed for now.
-- =============================================================================

-- ─── Off-peak eligibility check ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_off_peak(check_in_date DATE, check_out_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nights INT;
  start_month INT;
  start_day INT;
BEGIN
  IF check_in_date IS NULL OR check_out_date IS NULL OR check_out_date <= check_in_date THEN
    RETURN FALSE;
  END IF;

  nights := check_out_date - check_in_date;
  IF nights < 3 THEN
    RETURN FALSE;
  END IF;

  start_month := EXTRACT(MONTH FROM check_in_date);
  start_day := EXTRACT(DAY FROM check_in_date);

  -- Window 1: Jan 15 – Jun 15
  IF (start_month = 1 AND start_day >= 15)
     OR start_month IN (2, 3, 4, 5)
     OR (start_month = 6 AND start_day <= 15)
  THEN
    RETURN TRUE;
  END IF;

  -- Window 2: Sep 01 – Dec 01
  IF start_month IN (9, 10, 11)
     OR (start_month = 12 AND start_day = 1)
  THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
  -- TODO: exclude UAE public holidays + Ramadan overlap once calendar table exists.
END;
$$;

-- ─── Tier discount resolver ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tier_discount_pct(tier TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE LOWER(COALESCE(tier, 'standard'))
    WHEN 'gold' THEN 0.20
    WHEN 'silver' THEN 0.10
    ELSE 0
  END;
END;
$$;

-- ─── Boarding seasonal key resolver ──────────────────────────────────────────
-- Example:
--   p_base_key='presidential_single'
--   returns 'presidential_single_off_peak' when eligible and that key exists.
CREATE OR REPLACE FUNCTION resolve_boarding_pricing_key(
  p_base_key TEXT,
  p_check_in_date DATE,
  p_check_out_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_candidate TEXT;
  v_exists BOOLEAN;
BEGIN
  IF p_base_key IS NULL OR btrim(p_base_key) = '' THEN
    RAISE EXCEPTION 'p_base_key is required';
  END IF;

  IF NOT is_off_peak(p_check_in_date, p_check_out_date) THEN
    RETURN p_base_key;
  END IF;

  v_candidate := p_base_key || '_off_peak';
  SELECT EXISTS(SELECT 1 FROM pricing WHERE key = v_candidate) INTO v_exists;

  IF v_exists THEN
    RETURN v_candidate;
  END IF;

  RETURN p_base_key;
END;
$$;

-- ─── Generic line-price resolver ─────────────────────────────────────────────
-- Given a pricing key, quantity, and owner tier, returns:
--   (unit_price, discount_pct, discount_amount, subtotal, vat, total)
CREATE OR REPLACE FUNCTION resolve_line_price(
  p_pricing_key TEXT,
  p_quantity NUMERIC,
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
  v_base NUMERIC;
  v_qty NUMERIC;
  v_discount_pct NUMERIC;
  v_gross NUMERIC;
  v_disc NUMERIC;
  v_sub NUMERIC;
  v_vat NUMERIC;
BEGIN
  IF p_pricing_key IS NULL OR btrim(p_pricing_key) = '' THEN
    RAISE EXCEPTION 'p_pricing_key is required';
  END IF;

  v_qty := COALESCE(p_quantity, 1);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'p_quantity must be > 0';
  END IF;

  SELECT amount_aed INTO v_base
  FROM pricing
  WHERE key = p_pricing_key
  LIMIT 1;

  IF v_base IS NULL THEN
    RAISE EXCEPTION 'No pricing found for key: %', p_pricing_key;
  END IF;

  v_discount_pct := tier_discount_pct(p_tier);
  v_gross := v_base * v_qty;
  v_disc := ROUND(v_gross * v_discount_pct, 2);
  v_sub := v_gross - v_disc;
  v_vat := ROUND(v_sub * 0.05, 2);

  RETURN QUERY SELECT
    v_base,
    v_discount_pct,
    v_disc,
    v_sub,
    v_vat,
    v_sub + v_vat;
END;
$$;

-- ─── Seasonal line-price resolver convenience wrapper ────────────────────────
-- Uses base key + stay dates to switch to *_off_peak key when eligible.
CREATE OR REPLACE FUNCTION resolve_boarding_line_price(
  p_base_key TEXT,
  p_check_in_date DATE,
  p_check_out_date DATE,
  p_quantity NUMERIC,
  p_tier TEXT DEFAULT 'standard'
)
RETURNS TABLE (
  pricing_key TEXT,
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
  v_key TEXT;
BEGIN
  v_key := resolve_boarding_pricing_key(p_base_key, p_check_in_date, p_check_out_date);

  RETURN QUERY
  SELECT
    v_key,
    lp.unit_price,
    lp.discount_pct,
    lp.discount_amount,
    lp.subtotal,
    lp.vat,
    lp.total
  FROM resolve_line_price(v_key, p_quantity, p_tier) lp;
END;
$$;

-- =============================================================================
-- Usage examples
-- =============================================================================
-- SELECT is_off_peak('2026-04-20'::date, '2026-04-25'::date);  -- true
-- SELECT is_off_peak('2026-07-20'::date, '2026-07-25'::date);  -- false
-- SELECT resolve_boarding_pricing_key('presidential_single', '2026-04-20', '2026-04-25');
-- SELECT * FROM resolve_line_price('presidential_single', 5, 'gold');
-- SELECT * FROM resolve_boarding_line_price('presidential_single', '2026-04-20', '2026-04-25', 5, 'gold');
