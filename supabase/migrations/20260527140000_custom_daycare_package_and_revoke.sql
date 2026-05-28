-- Custom staff-issued daycare packages + revoke/delete unused package credits.

ALTER TABLE purchase_groups
  ADD COLUMN IF NOT EXISTS staff_label text;

COMMENT ON COLUMN purchase_groups.staff_label IS
  'Optional display label for custom-issued packages (e.g. complimentary 1 daycare day).';

INSERT INTO package_definitions (
  code,
  display_name,
  description,
  category,
  validity_months,
  sort_order,
  multi_pet_discount_pct,
  is_active
) VALUES (
  'custom_daycare',
  'Custom daycare package',
  'Staff-issued daycare credit with custom day allowance and price (may be AED 0).',
  'daycare',
  6,
  5,
  0,
  true
)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = true;

-- Catalog purchases must not pick the custom template (RPC-only).
UPDATE package_definitions
SET is_active = false
WHERE code = 'custom_daycare';

CREATE OR REPLACE FUNCTION public.issue_custom_daycare_package(
  p_owner_id uuid,
  p_pet_ids uuid[],
  p_units integer,
  p_amount_aed numeric DEFAULT 0,
  p_label text DEFAULT 'Custom daycare package',
  p_validity_months integer DEFAULT 6,
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_service_code service_code DEFAULT 'daycare_full_day'::service_code
)
RETURNS TABLE(
  invoice_id uuid,
  purchase_group_id uuid,
  total_amount_aed numeric,
  discount_applied_aed numeric,
  credits_granted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_def_id uuid;
  v_invoice_id uuid;
  v_purchase_group_id uuid;
  v_subtotal numeric := 0;
  v_total numeric;
  v_pet_id uuid;
  v_pet_name text;
  v_pet_count int;
  v_distinct_pet_count int;
  v_credits_count int := 0;
  v_label text;
  v_line_desc text;
  v_amount numeric;
  v_expires date;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'issue_custom_daycare_package requires authenticated user';
  END IF;

  IF array_length(p_pet_ids, 1) IS NULL OR array_length(p_pet_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_pet_ids must contain at least one pet';
  END IF;

  IF p_units IS NULL OR p_units < 1 OR p_units > 365 THEN
    RAISE EXCEPTION 'p_units must be between 1 and 365';
  END IF;

  IF p_amount_aed IS NULL OR p_amount_aed < 0 THEN
    RAISE EXCEPTION 'p_amount_aed must be >= 0';
  END IF;

  IF p_validity_months IS NULL OR p_validity_months < 1 OR p_validity_months > 36 THEN
    RAISE EXCEPTION 'p_validity_months must be between 1 and 36';
  END IF;

  v_label := nullif(trim(p_label), '');
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'p_label is required';
  END IF;

  IF p_service_code NOT IN ('daycare_full_day', 'daycare_hourly') THEN
    RAISE EXCEPTION 'p_service_code must be daycare_full_day or daycare_hourly';
  END IF;

  SELECT COUNT(DISTINCT pid) INTO v_distinct_pet_count
  FROM unnest(p_pet_ids) AS pid;
  IF v_distinct_pet_count <> array_length(p_pet_ids, 1) THEN
    RAISE EXCEPTION 'p_pet_ids contains duplicate pet ids';
  END IF;

  SELECT id INTO v_package_def_id
  FROM package_definitions
  WHERE code = 'custom_daycare';

  IF v_package_def_id IS NULL THEN
    RAISE EXCEPTION 'custom_daycare package definition missing — run migration';
  END IF;

  v_pet_count := array_length(p_pet_ids, 1);
  v_amount := round(p_amount_aed::numeric, 2);
  v_expires := (CURRENT_DATE + (p_validity_months || ' months')::interval)::date;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, subtotal_aed, discount_amount, discount_aed,
    total, total_aed, vat_aed, payment_method, service_type, notes
  ) VALUES (
    p_owner_id,
    CURRENT_DATE,
    CASE WHEN v_amount = 0 THEN 'paid'::invoice_status ELSE 'issued'::invoice_status END,
    0, 0, 0, 0, 0, 0, 0,
    p_payment_method,
    'package',
    'Custom daycare package: ' || v_label
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied, staff_label
  ) VALUES (
    p_owner_id, v_invoice_id, v_package_def_id, v_pet_count, 0, v_label
  )
  RETURNING id INTO v_purchase_group_id;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.name INTO v_pet_name
    FROM pets p
    WHERE p.id = v_pet_id AND p.owner_id = p_owner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    v_line_desc := v_label || ' — ' || COALESCE(v_pet_name, 'Pet')
      || ' (' || p_units::text || ' '
      || CASE WHEN p_service_code = 'daycare_hourly' THEN 'hourly credits' ELSE 'daycare days' END
      || ')';

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_invoice_id, v_line_desc, 1, v_amount, v_amount, v_amount, 'package'
    );

    v_subtotal := v_subtotal + v_amount;

    INSERT INTO service_credits (
      pet_id, service_code, units_total, units_consumed, expires_at,
      source_type, source_ref_id, purchase_group_id, redemption_group_id, is_bonus, status
    ) VALUES (
      v_pet_id, p_service_code, p_units, 0, v_expires,
      'package_purchase', v_invoice_id, v_purchase_group_id, NULL, false, 'active'
    );

    v_credits_count := v_credits_count + 1;
  END LOOP;

  v_total := v_subtotal;

  UPDATE invoices
  SET subtotal = v_subtotal,
      subtotal_aed = v_subtotal,
      discount_pct = 0,
      discount_amount = 0,
      discount_aed = 0,
      total = v_total,
      total_aed = v_total,
      vat_aed = CASE WHEN v_total > 0 THEN round(v_total - (v_total / 1.05), 2) ELSE 0 END,
      paid_at = CASE WHEN v_total = 0 THEN now() ELSE paid_at END,
      amount_paid = CASE WHEN v_total = 0 THEN 0 ELSE amount_paid END,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_purchase_group_id, v_total, 0::numeric, v_credits_count;
END
$function$;

REVOKE ALL ON FUNCTION public.issue_custom_daycare_package(uuid, uuid[], integer, numeric, text, integer, payment_method, service_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_custom_daycare_package(uuid, uuid[], integer, numeric, text, integer, payment_method, service_code) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_custom_daycare_package(uuid, uuid[], integer, numeric, text, integer, payment_method, service_code) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_daycare_package_credit(
  p_credit_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(credit_id uuid, invoice_voided boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit record;
  v_session_count int;
  v_active_sibling_count int;
  v_invoice_id uuid;
  v_invoice_voided boolean := false;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'revoke_daycare_package_credit requires authenticated user';
  END IF;

  SELECT *
  INTO v_credit
  FROM service_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package credit % not found', p_credit_id;
  END IF;

  IF v_credit.service_code NOT IN ('daycare_full_day', 'daycare_hourly') THEN
    RAISE EXCEPTION 'Only daycare package credits can be revoked with this function';
  END IF;

  IF v_credit.status = 'revoked' THEN
    RETURN QUERY SELECT p_credit_id, false;
    RETURN;
  END IF;

  IF coalesce(v_credit.units_consumed, 0) > 0 THEN
    RAISE EXCEPTION 'Cannot remove package — % day(s) already used. Cancel check-ins first if needed.',
      v_credit.units_consumed;
  END IF;

  SELECT count(*) INTO v_session_count
  FROM daycare_sessions ds
  WHERE ds.package_id = p_credit_id;

  IF v_session_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove package — % planner/check-in session(s) still linked. Delete those sessions first.',
      v_session_count;
  END IF;

  UPDATE service_credits
  SET status = 'revoked'
  WHERE id = p_credit_id;

  v_invoice_id := NULL;
  IF v_credit.purchase_group_id IS NOT NULL THEN
    SELECT pg.invoice_id INTO v_invoice_id
    FROM purchase_groups pg
    WHERE pg.id = v_credit.purchase_group_id;
  END IF;

  IF v_invoice_id IS NOT NULL AND v_credit.purchase_group_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_sibling_count
    FROM service_credits sc
    WHERE sc.purchase_group_id = v_credit.purchase_group_id
      AND sc.id <> p_credit_id
      AND sc.status = 'active';

    IF v_active_sibling_count = 0 THEN
      UPDATE invoices
      SET status = 'voided',
          voided_at = now(),
          voided_reason = coalesce(nullif(trim(p_reason), ''), 'Daycare package removed by staff'),
          notes = coalesce(notes, '') || ' [Package revoked]'
      WHERE id = v_invoice_id
        AND status NOT IN ('voided', 'cancelled', 'paid');

      v_invoice_voided := FOUND;
    END IF;
  END IF;

  RETURN QUERY SELECT p_credit_id, v_invoice_voided;
END
$function$;

REVOKE ALL ON FUNCTION public.revoke_daycare_package_credit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_daycare_package_credit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_daycare_package_credit(uuid, text) TO service_role;

-- Verification
SELECT code, display_name, is_active FROM package_definitions WHERE code = 'custom_daycare';

SELECT proname FROM pg_proc
WHERE proname IN ('issue_custom_daycare_package', 'revoke_daycare_package_credit');
