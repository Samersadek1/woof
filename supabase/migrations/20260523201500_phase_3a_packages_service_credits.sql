BEGIN;

-- ============================================================
-- A.1 DROP LEGACY DAYCARE PACKAGE TABLES (after zero-row gate)
-- ============================================================
DO $$
DECLARE
  v_daycare_packages_count bigint;
  v_daycare_package_types_count bigint;
BEGIN
  IF to_regclass('public.daycare_packages') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.daycare_packages' INTO v_daycare_packages_count;
  ELSE
    v_daycare_packages_count := 0;
  END IF;

  IF to_regclass('public.daycare_package_types') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.daycare_package_types' INTO v_daycare_package_types_count;
  ELSE
    v_daycare_package_types_count := 0;
  END IF;

  IF v_daycare_packages_count > 0 OR v_daycare_package_types_count > 0 THEN
    RAISE EXCEPTION
      'Cannot drop legacy daycare package tables: daycare_packages=%, daycare_package_types=%',
      v_daycare_packages_count, v_daycare_package_types_count;
  END IF;
END
$$;

DROP TABLE IF EXISTS daycare_packages CASCADE;
DROP TABLE IF EXISTS daycare_package_types CASCADE;

-- ============================================================
-- A.2 NEW TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS package_definitions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('daycare', 'grooming', 'treadmill')),
  validity_months int NOT NULL CHECK (validity_months > 0),
  multi_pet_discount_pct numeric(5,2) NOT NULL DEFAULT 10.00
    CHECK (multi_pet_discount_pct >= 0 AND multi_pet_discount_pct <= 100),
  applicable_species species[] NOT NULL DEFAULT ARRAY['dog']::species[],
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_pricing (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_def_id uuid NOT NULL REFERENCES package_definitions(id) ON DELETE CASCADE,
  pet_size pet_size,
  coat_type coat_type,
  amount_aed numeric(10,2) NOT NULL CHECK (amount_aed >= 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS package_pricing_dimensions_unique
  ON package_pricing (package_def_id, pet_size, coat_type)
  NULLS NOT DISTINCT
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS package_credit_grants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_def_id uuid NOT NULL REFERENCES package_definitions(id) ON DELETE CASCADE,
  service_code service_code NOT NULL,
  units int NOT NULL CHECK (units > 0),
  is_bonus boolean NOT NULL DEFAULT false,
  exclusive_group text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES owners(id),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  package_def_id uuid NOT NULL REFERENCES package_definitions(id),
  pet_count int NOT NULL CHECK (pet_count > 0),
  multi_pet_discount_applied numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_credits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  service_code service_code NOT NULL,
  units_total int NOT NULL CHECK (units_total > 0),
  units_consumed int NOT NULL DEFAULT 0 CHECK (units_consumed >= 0),
  expires_at date NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('package_purchase', 'promotional', 'refund', 'long_stay_perk')),
  source_ref_id uuid,
  purchase_group_id uuid REFERENCES purchase_groups(id) ON DELETE SET NULL,
  redemption_group_id uuid,
  is_bonus boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'depleted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_consumed_lte_total CHECK (units_consumed <= units_total)
);

CREATE INDEX IF NOT EXISTS idx_service_credits_pet_active
  ON service_credits (pet_id, service_code, status, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_service_credits_redemption_group
  ON service_credits (redemption_group_id)
  WHERE redemption_group_id IS NOT NULL;

-- ============================================================
-- A.3 RLS POLICIES
-- ============================================================
ALTER TABLE package_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_definitions_read" ON package_definitions;
CREATE POLICY "package_definitions_read" ON package_definitions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "package_pricing_read" ON package_pricing;
CREATE POLICY "package_pricing_read" ON package_pricing
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "package_credit_grants_read" ON package_credit_grants;
CREATE POLICY "package_credit_grants_read" ON package_credit_grants
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "purchase_groups_read" ON purchase_groups;
CREATE POLICY "purchase_groups_read" ON purchase_groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_credits_read" ON service_credits;
CREATE POLICY "service_credits_read" ON service_credits
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- A.4 EXTEND BILLING ADJUSTMENTS CHECK CONSTRAINT
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.billing_adjustments
    DROP CONSTRAINT IF EXISTS billing_adjustments_adjustment_type_check;

  ALTER TABLE public.billing_adjustments
    ADD CONSTRAINT billing_adjustments_adjustment_type_check
    CHECK (
      adjustment_type = ANY (
        ARRAY[
          'price_override'::text,
          'refund_override'::text,
          'discount_override'::text,
          'fee_waived'::text,
          'goodwill_credit'::text,
          'cancellation_refund'::text,
          'double_occupancy_discount'::text,
          'multi_pet_package_discount'::text
        ]
      )
    );
END
$$;

-- ============================================================
-- B.1 PACKAGE DEFINITIONS SEED (9 ROWS)
-- ============================================================
INSERT INTO package_definitions (code, display_name, description, category, validity_months, sort_order) VALUES
  ('threes_a_charm',          'Threes-A-Charm',               '3 Full Daycare Days',                                         'daycare',   1, 10),
  ('lucky_7',                 'Lucky 7',                      '7 Full Daycare Days',                                         'daycare',   2, 20),
  ('thirty_day_ticket',       '30 Day Ticket',                '30 Full Daycare Days + 1 bonus daycare day OR 1 free Splash', 'daycare',   6, 30),
  ('six_summer_splash_short', '6 Summer Splash (Short Hair)', '6 Splash sessions for short-coated dogs',                     'grooming',  8, 40),
  ('six_summer_splash_long',  '6 Summer Splash (Long Hair)',  '6 Splash sessions for long-coated dogs',                      'grooming',  8, 50),
  ('six_full_service',        '6 Full Service',               '6 Full Service grooming sessions',                            'grooming',  8, 60),
  ('full_service_yearly',     'Full Service Yearly',          '12 Full Service grooming sessions',                           'grooming', 14, 70),
  ('treadmill_10_sessions',   'Treadmill 10 Sessions',        '10 treadmill sessions',                                       'treadmill', 2, 80),
  ('treadmill_20_sessions',   'Treadmill 20 Sessions',        '20 treadmill sessions',                                       'treadmill', 4, 90)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- B.2 PACKAGE PRICING SEED (17 ROWS)
-- ============================================================
WITH price_seed AS (
  SELECT pd.id AS package_def_id, s.pet_size::pet_size AS pet_size, s.coat_type::coat_type AS coat_type, s.amount_aed
  FROM (
    VALUES
      ('threes_a_charm',        NULL,     NULL,    267.75::numeric(10,2)),
      ('lucky_7',               NULL,     NULL,    588.00::numeric(10,2)),
      ('thirty_day_ticket',     NULL,     NULL,   2441.50::numeric(10,2)),
      ('six_summer_splash_short','small', 'short', 525.00::numeric(10,2)),
      ('six_summer_splash_short','medium','short', 656.25::numeric(10,2)),
      ('six_summer_splash_short','large', 'short', 761.25::numeric(10,2)),
      ('six_summer_splash_long', 'small', 'long',  656.25::numeric(10,2)),
      ('six_summer_splash_long', 'medium','long',  708.75::numeric(10,2)),
      ('six_summer_splash_long', 'large', 'long',  787.50::numeric(10,2)),
      ('six_full_service',       'small', NULL,   1050.00::numeric(10,2)),
      ('six_full_service',       'medium',NULL,   1181.25::numeric(10,2)),
      ('six_full_service',       'large', NULL,   1312.00::numeric(10,2)),
      ('full_service_yearly',    'small', NULL,   2100.00::numeric(10,2)),
      ('full_service_yearly',    'medium',NULL,   2362.50::numeric(10,2)),
      ('full_service_yearly',    'large', NULL,   2625.00::numeric(10,2)),
      ('treadmill_10_sessions',  NULL,    NULL,    283.50::numeric(10,2)),
      ('treadmill_20_sessions',  NULL,    NULL,    525.00::numeric(10,2))
  ) AS s(package_code, pet_size, coat_type, amount_aed)
  JOIN package_definitions pd ON pd.code = s.package_code
)
INSERT INTO package_pricing (package_def_id, pet_size, coat_type, amount_aed, is_active)
SELECT ps.package_def_id, ps.pet_size, ps.coat_type, ps.amount_aed, true
FROM price_seed ps
WHERE NOT EXISTS (
  SELECT 1
  FROM package_pricing pp
  WHERE pp.package_def_id = ps.package_def_id
    AND pp.is_active = true
    AND pp.pet_size IS NOT DISTINCT FROM ps.pet_size
    AND pp.coat_type IS NOT DISTINCT FROM ps.coat_type
);

-- ============================================================
-- B.3 PACKAGE CREDIT GRANTS SEED (11 ROWS)
-- ============================================================
WITH grants_seed AS (
  SELECT pd.id AS package_def_id, gs.service_code::service_code, gs.units, gs.is_bonus, gs.exclusive_group, gs.sort_order
  FROM (
    VALUES
      ('threes_a_charm',         'daycare_full_day',        3,  false, NULL,          10),
      ('lucky_7',                'daycare_full_day',        7,  false, NULL,          10),
      ('thirty_day_ticket',      'daycare_full_day',       30,  false, NULL,          10),
      ('thirty_day_ticket',      'daycare_full_day',        1,  true,  'bonus_choice',20),
      ('thirty_day_ticket',      'grooming_splash',         1,  true,  'bonus_choice',21),
      ('six_summer_splash_short','grooming_splash',         6,  false, NULL,          10),
      ('six_summer_splash_long', 'grooming_splash',         6,  false, NULL,          10),
      ('six_full_service',       'grooming_full_service',   6,  false, NULL,          10),
      ('full_service_yearly',    'grooming_full_service',  12,  false, NULL,          10),
      ('treadmill_10_sessions',  'treadmill_daycare_addon',10,  false, NULL,          10),
      ('treadmill_20_sessions',  'treadmill_daycare_addon',20,  false, NULL,          10)
  ) AS gs(package_code, service_code, units, is_bonus, exclusive_group, sort_order)
  JOIN package_definitions pd ON pd.code = gs.package_code
)
INSERT INTO package_credit_grants (package_def_id, service_code, units, is_bonus, exclusive_group, sort_order)
SELECT gs.package_def_id, gs.service_code, gs.units, gs.is_bonus, gs.exclusive_group, gs.sort_order
FROM grants_seed gs
WHERE NOT EXISTS (
  SELECT 1
  FROM package_credit_grants pcg
  WHERE pcg.package_def_id = gs.package_def_id
    AND pcg.service_code = gs.service_code
    AND pcg.units = gs.units
    AND pcg.is_bonus = gs.is_bonus
    AND pcg.exclusive_group IS NOT DISTINCT FROM gs.exclusive_group
    AND pcg.sort_order = gs.sort_order
);

-- ============================================================
-- C.1 RPC: purchase_package
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_package(
  p_owner_id uuid,
  p_package_code text,
  p_pet_ids uuid[],
  p_payment_method payment_method DEFAULT 'card'
)
RETURNS TABLE (
  invoice_id uuid,
  purchase_group_id uuid,
  total_amount_aed numeric,
  discount_applied_aed numeric,
  credits_granted int
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = 'public'
AS $$
DECLARE
  v_package_def_id uuid;
  v_validity_months int;
  v_multi_pet_discount_pct numeric;
  v_invoice_id uuid;
  v_purchase_group_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_pet_id uuid;
  v_pet_size pet_size;
  v_pet_coat coat_type;
  v_pet_name text;
  v_pet_amount numeric;
  v_grant record;
  v_grant_redemption_group_id uuid;
  v_credits_count int := 0;
  v_pet_count int;
  v_distinct_pet_count int;
  v_display_name text;
  v_redemption_groups jsonb := '{}'::jsonb;
BEGIN
  IF array_length(p_pet_ids, 1) IS NULL OR array_length(p_pet_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_pet_ids must contain at least one pet';
  END IF;

  SELECT COUNT(DISTINCT pid) INTO v_distinct_pet_count
  FROM unnest(p_pet_ids) AS pid;
  IF v_distinct_pet_count <> array_length(p_pet_ids, 1) THEN
    RAISE EXCEPTION 'p_pet_ids contains duplicate pet ids';
  END IF;

  SELECT id, validity_months, multi_pet_discount_pct, display_name
  INTO v_package_def_id, v_validity_months, v_multi_pet_discount_pct, v_display_name
  FROM package_definitions
  WHERE code = p_package_code AND is_active = true;

  IF v_package_def_id IS NULL THEN
    RAISE EXCEPTION 'Package % not found or inactive', p_package_code;
  END IF;

  v_pet_count := array_length(p_pet_ids, 1);

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, discount_amount, total, payment_method, service_type
  ) VALUES (
    p_owner_id, CURRENT_DATE, 'issued'::invoice_status, 0, 0, 0, p_payment_method, 'package'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied
  ) VALUES (
    p_owner_id,
    v_invoice_id,
    v_package_def_id,
    v_pet_count,
    CASE WHEN v_pet_count >= 2 THEN v_multi_pet_discount_pct ELSE 0 END
  )
  RETURNING id INTO v_purchase_group_id;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.size, p.coat_type, p.name
    INTO v_pet_size, v_pet_coat, v_pet_name
    FROM pets p
    WHERE p.id = v_pet_id
      AND p.owner_id = p_owner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    IF v_pet_size IS NULL AND NOT EXISTS (
      SELECT 1
      FROM package_pricing
      WHERE package_def_id = v_package_def_id
        AND pet_size IS NULL
        AND coat_type IS NULL
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Pet % has no size set and package requires size-based pricing', v_pet_id;
    END IF;

    SELECT pp.amount_aed
    INTO v_pet_amount
    FROM package_pricing pp
    WHERE pp.package_def_id = v_package_def_id
      AND pp.is_active = true
      AND (pp.pet_size IS NULL OR pp.pet_size = v_pet_size)
      AND (pp.coat_type IS NULL OR pp.coat_type = v_pet_coat)
    ORDER BY
      (pp.pet_size IS NOT NULL)::int DESC,
      (pp.coat_type IS NOT NULL)::int DESC
    LIMIT 1;

    IF v_pet_amount IS NULL THEN
      RAISE EXCEPTION 'No active pricing for package % pet_size % coat_type %',
        p_package_code, v_pet_size, v_pet_coat;
    END IF;

    INSERT INTO invoice_line_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      total_price,
      line_total,
      service_type
    ) VALUES (
      v_invoice_id,
      v_display_name || ' - ' || COALESCE(v_pet_name, 'Pet'),
      1,
      v_pet_amount,
      v_pet_amount,
      v_pet_amount,
      'package'
    );

    v_subtotal := v_subtotal + v_pet_amount;

    v_redemption_groups := '{}'::jsonb;
    FOR v_grant IN
      SELECT service_code, units, is_bonus, exclusive_group
      FROM package_credit_grants
      WHERE package_def_id = v_package_def_id
      ORDER BY sort_order
    LOOP
      IF v_grant.exclusive_group IS NOT NULL THEN
        IF NOT (v_redemption_groups ? v_grant.exclusive_group) THEN
          v_redemption_groups :=
            jsonb_set(
              v_redemption_groups,
              ARRAY[v_grant.exclusive_group],
              to_jsonb(uuid_generate_v4()::text),
              true
            );
        END IF;
        v_grant_redemption_group_id := (v_redemption_groups ->> v_grant.exclusive_group)::uuid;
      ELSE
        v_grant_redemption_group_id := NULL;
      END IF;

      INSERT INTO service_credits (
        pet_id,
        service_code,
        units_total,
        expires_at,
        source_type,
        source_ref_id,
        purchase_group_id,
        redemption_group_id,
        is_bonus
      ) VALUES (
        v_pet_id,
        v_grant.service_code,
        v_grant.units,
        (CURRENT_DATE + (v_validity_months || ' months')::interval)::date,
        'package_purchase',
        v_invoice_id,
        v_purchase_group_id,
        v_grant_redemption_group_id,
        v_grant.is_bonus
      );

      v_credits_count := v_credits_count + 1;
    END LOOP;
  END LOOP;

  IF v_pet_count >= 2 THEN
    v_discount := ROUND(v_subtotal * v_multi_pet_discount_pct / 100.0, 2);

    INSERT INTO billing_adjustments (
      owner_id,
      invoice_id,
      adjustment_type,
      original_amount,
      adjusted_amount,
      reason,
      approved_by
    ) VALUES (
      p_owner_id,
      v_invoice_id,
      'multi_pet_package_discount',
      v_discount,
      -v_discount,
      'Multi-pet package discount ' || v_multi_pet_discount_pct::text || '% (' || v_pet_count::text || ' pets)',
      'system'
    );
  END IF;

  v_total := v_subtotal - v_discount;

  UPDATE invoices
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      total = v_total,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN QUERY
  SELECT v_invoice_id, v_purchase_group_id, v_total, v_discount, v_credits_count;
END
$$;

-- ============================================================
-- C.2 RPC: consume_service_credit
-- ============================================================
CREATE OR REPLACE FUNCTION consume_service_credit(
  p_credit_id uuid,
  p_units int DEFAULT 1,
  p_consumed_for_ref_id uuid DEFAULT NULL,
  p_consumed_for_ref_type text DEFAULT NULL
)
RETURNS TABLE (
  credit_id uuid,
  units_remaining int,
  new_status text
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = 'public'
AS $$
DECLARE
  v_credit record;
  v_new_consumed int;
  v_new_status text;
BEGIN
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'p_units must be > 0';
  END IF;

  SELECT *
  INTO v_credit
  FROM service_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit % not found', p_credit_id;
  END IF;

  IF v_credit.status <> 'active' THEN
    RAISE EXCEPTION 'Credit not active';
  END IF;

  IF v_credit.expires_at < CURRENT_DATE THEN
    UPDATE service_credits
    SET status = 'expired'
    WHERE id = p_credit_id;
    RAISE EXCEPTION 'Credit expired on %', v_credit.expires_at;
  END IF;

  IF p_units > (v_credit.units_total - v_credit.units_consumed) THEN
    RAISE EXCEPTION 'Insufficient units (% available, % requested)',
      (v_credit.units_total - v_credit.units_consumed), p_units;
  END IF;

  v_new_consumed := v_credit.units_consumed + p_units;
  v_new_status := CASE
    WHEN v_new_consumed >= v_credit.units_total THEN 'depleted'
    ELSE 'active'
  END;

  UPDATE service_credits
  SET units_consumed = v_new_consumed,
      status = v_new_status
  WHERE id = p_credit_id;

  IF v_credit.redemption_group_id IS NOT NULL AND v_credit.is_bonus THEN
    UPDATE service_credits
    SET status = 'revoked'
    WHERE redemption_group_id = v_credit.redemption_group_id
      AND id <> p_credit_id
      AND status = 'active';
  END IF;

  RETURN QUERY
  SELECT p_credit_id, (v_credit.units_total - v_new_consumed), v_new_status;
END
$$;

-- ============================================================
-- C.3 RPC: list_active_credits_for_pet
-- ============================================================
CREATE OR REPLACE FUNCTION list_active_credits_for_pet(
  p_pet_id uuid,
  p_service_code service_code DEFAULT NULL
)
RETURNS TABLE (
  credit_id uuid,
  service_code service_code,
  units_remaining int,
  expires_at date,
  is_bonus boolean,
  source_type text,
  package_name text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = 'public'
AS $$
  SELECT
    sc.id AS credit_id,
    sc.service_code,
    (sc.units_total - sc.units_consumed)::int AS units_remaining,
    sc.expires_at,
    sc.is_bonus,
    sc.source_type,
    pd.display_name AS package_name
  FROM service_credits sc
  LEFT JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
  LEFT JOIN package_definitions pd ON pd.id = pg.package_def_id
  WHERE sc.pet_id = p_pet_id
    AND sc.status = 'active'
    AND sc.expires_at >= CURRENT_DATE
    AND (p_service_code IS NULL OR sc.service_code = p_service_code)
  ORDER BY sc.expires_at ASC, sc.is_bonus DESC;
$$;

COMMIT;
