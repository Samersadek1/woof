-- MSH pricing consistency fixes (idempotent):
-- 1) Add platinum membership tier support
-- 2) Make membership discounts data-driven via pricing keys
-- 3) Normalize room pricing_category mappings to match live rate-card keys
-- 4) Keep only 12-day daycare package types active

BEGIN;

-- 1) Extend member_type enum with platinum (safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'member_type'
      AND e.enumlabel = 'platinum'
  ) THEN
    ALTER TYPE public.member_type ADD VALUE 'platinum';
  END IF;
END;
$$;

-- 2) Persist discount percentages in pricing table (single source of truth for admin UI)
INSERT INTO public.pricing (key, amount_aed, label, category)
VALUES
  ('membership_discount_silver',   10.00, 'Membership Discount — Silver (%)',   'membership'),
  ('membership_discount_gold',     20.00, 'Membership Discount — Gold (%)',     'membership'),
  ('membership_discount_platinum', 30.00, 'Membership Discount — Platinum (%)', 'membership'),
  ('membership_discount_silver_pct',   10.00, 'Membership Discount Silver % (legacy)',   'membership'),
  ('membership_discount_gold_pct',     20.00, 'Membership Discount Gold % (legacy)',     'membership'),
  ('membership_discount_platinum_pct', 30.00, 'Membership Discount Platinum % (legacy)', 'membership')
ON CONFLICT (key) DO UPDATE
SET amount_aed = EXCLUDED.amount_aed,
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    updated_at = now();

-- Data-driven discount helper (falls back to legacy defaults if key missing)
CREATE OR REPLACE FUNCTION public.tier_discount_pct(tier TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tier TEXT := lower(trim(coalesce(tier, 'standard')));
  v_key TEXT;
  v_pct NUMERIC;
BEGIN
  v_key := CASE v_tier
    WHEN 'silver' THEN 'membership_discount_silver'
    WHEN 'gold' THEN 'membership_discount_gold'
    WHEN 'platinum' THEN 'membership_discount_platinum'
    ELSE NULL
  END;

  IF v_key IS NOT NULL THEN
    SELECT p.amount_aed
      INTO v_pct
      FROM public.pricing p
     WHERE p.key = v_key
     LIMIT 1;
  END IF;

  IF v_pct IS NULL THEN
    v_pct := CASE v_tier
      WHEN 'silver' THEN 10
      WHEN 'gold' THEN 20
      WHEN 'platinum' THEN 30
      ELSE 0
    END;
  END IF;

  RETURN GREATEST(v_pct, 0);
END;
$$;

-- Main discount function now uses tier_discount_pct (keeps existing interface)
CREATE OR REPLACE FUNCTION public.apply_member_discount(
  p_owner_id UUID,
  p_subtotal NUMERIC
)
RETURNS TABLE (
  discount_pct NUMERIC,
  discount_aed NUMERIC,
  final_aed NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_type TEXT := 'standard';
  v_pct NUMERIC := 0;
BEGIN
  SELECT o.member_type::TEXT
    INTO v_member_type
    FROM public.owners o
   WHERE o.id = p_owner_id;

  v_pct := public.tier_discount_pct(v_member_type);

  RETURN QUERY
  SELECT
    v_pct,
    ROUND(p_subtotal * v_pct / 100.0, 2),
    ROUND(p_subtotal * (1.0 - v_pct / 100.0), 2);
END;
$$;

-- 3) Normalize room pricing categories to live rate-card naming
UPDATE public.rooms
SET pricing_category = CASE room_type
  WHEN 'presidential_super' THEN 'presidential'
  WHEN 'presidential_standard' THEN 'presidential'
  WHEN 'royal_suite_single' THEN 'royal'
  WHEN 'single_royal' THEN 'royal'
  WHEN 'royal_annex' THEN 'royal'
  WHEN 'royal_suite_double' THEN 'royal'
  WHEN 'double_royal' THEN 'royal'
  WHEN 'family_room' THEN 'family_family'
  WHEN 'cattery_deluxe' THEN 'cattery_deluxe'
  WHEN 'cattery_presidential' THEN 'cattery_presidential'
  WHEN 'cattery_super_presidential' THEN 'cattery_super_presidential'
  ELSE pricing_category
END
WHERE room_type IN (
  'presidential_super',
  'presidential_standard',
  'royal_suite_single',
  'single_royal',
  'royal_annex',
  'royal_suite_double',
  'double_royal',
  'family_room',
  'cattery_deluxe',
  'cattery_presidential',
  'cattery_super_presidential'
);

-- 4) Keep only 12-day package types active
UPDATE public.daycare_package_types
SET is_active = (total_days = 12),
    updated_at = now();

COMMIT;

-- Verification snippets:
-- SELECT key, amount_aed FROM public.pricing WHERE key LIKE 'membership_discount_%' ORDER BY key;
-- SELECT public.tier_discount_pct('silver') AS silver_pct, public.tier_discount_pct('gold') AS gold_pct, public.tier_discount_pct('platinum') AS platinum_pct;
-- SELECT room_type, capacity_type, pricing_category FROM public.rooms ORDER BY room_type, room_number NULLS LAST;
-- SELECT id, name, total_days, base_price_aed, is_active FROM public.daycare_package_types ORDER BY sort_order, name;
