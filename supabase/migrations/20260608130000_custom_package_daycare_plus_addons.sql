-- Custom daycare packages: per-pet daycare pricing (unchanged) plus optional
-- additional-service line items on top. Multi-pet discount applies to daycare only.

UPDATE package_definitions
SET multi_pet_discount_pct = 10
WHERE code = 'custom_daycare';

CREATE OR REPLACE FUNCTION public.issue_custom_daycare_package(
  p_owner_id uuid,
  p_pet_ids uuid[],
  p_units integer,
  p_amount_aed numeric DEFAULT 0,
  p_label text DEFAULT 'Custom daycare package'::text,
  p_validity_months integer DEFAULT 6,
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_service_code service_code DEFAULT 'daycare_full_day'::service_code,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_line_items jsonb DEFAULT NULL
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
  v_daycare_subtotal numeric := 0;
  v_addons_subtotal numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_multi_pet_discount_pct numeric := 0;
  v_pet_id uuid;
  v_pet_name text;
  v_pet_count int;
  v_distinct_pet_count int;
  v_credits_count int := 0;
  v_label text;
  v_line_desc text;
  v_amount numeric;
  v_issue date := coalesce(p_issue_date, CURRENT_DATE);
  v_expires date;
  v_has_addon_lines boolean := false;
  v_line record;
  v_line_total numeric;
  v_line_qty int;
  v_line_unit numeric;
  v_line_desc_in text;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'issue_custom_daycare_package requires authenticated user';
  END IF;

  IF v_issue > CURRENT_DATE THEN
    RAISE EXCEPTION 'p_issue_date cannot be in the future';
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

  SELECT COUNT(DISTINCT pid) INTO v_distinct_pet_count FROM unnest(p_pet_ids) AS pid;
  IF v_distinct_pet_count <> array_length(p_pet_ids, 1) THEN
    RAISE EXCEPTION 'p_pet_ids contains duplicate pet ids';
  END IF;

  v_has_addon_lines := p_line_items IS NOT NULL
    AND jsonb_typeof(p_line_items) = 'array'
    AND jsonb_array_length(p_line_items) > 0;

  IF v_has_addon_lines THEN
    FOR v_line IN
      SELECT *
      FROM jsonb_to_recordset(p_line_items) AS x(description text, quantity int, unit_price numeric)
    LOOP
      v_line_desc_in := nullif(trim(v_line.description), '');
      IF v_line_desc_in IS NULL THEN
        RAISE EXCEPTION 'Each additional line item requires a description';
      END IF;

      v_line_qty := coalesce(v_line.quantity, 0);
      IF v_line_qty < 1 OR v_line_qty > 9999 THEN
        RAISE EXCEPTION 'Line item quantity must be between 1 and 9999';
      END IF;

      v_line_unit := round(coalesce(v_line.unit_price, -1)::numeric, 2);
      IF v_line_unit < 0 THEN
        RAISE EXCEPTION 'Line item unit_price must be >= 0';
      END IF;
    END LOOP;
  END IF;

  SELECT id, multi_pet_discount_pct
  INTO v_package_def_id, v_multi_pet_discount_pct
  FROM package_definitions
  WHERE code = 'custom_daycare';
  IF v_package_def_id IS NULL THEN
    RAISE EXCEPTION 'custom_daycare package definition missing';
  END IF;

  v_pet_count := array_length(p_pet_ids, 1);
  v_amount := round(p_amount_aed::numeric, 2);
  v_expires := (v_issue + (p_validity_months || ' months')::interval)::date;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, discount_amount, total, vat_aed,
    payment_method, service_type, notes
  ) VALUES (
    p_owner_id,
    v_issue,
    'issued'::invoice_status,
    0, 0, 0, 0,
    p_payment_method,
    'package',
    'Custom daycare package: ' || v_label
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied, staff_label
  ) VALUES (
    p_owner_id,
    v_invoice_id,
    v_package_def_id,
    v_pet_count,
    CASE WHEN v_pet_count >= 2 THEN v_multi_pet_discount_pct ELSE 0 END,
    v_label
  )
  RETURNING id INTO v_purchase_group_id;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.name INTO v_pet_name FROM pets p WHERE p.id = v_pet_id AND p.owner_id = p_owner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    v_line_desc := v_label || ' — ' || COALESCE(v_pet_name, 'Pet')
      || ' (' || p_units::text || ' '
      || CASE WHEN p_service_code = 'daycare_hourly' THEN 'hourly credits' ELSE 'daycare days' END || ')';

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_invoice_id, v_line_desc, 1, v_amount, v_amount, v_amount, 'package'
    );

    v_daycare_subtotal := v_daycare_subtotal + v_amount;
  END LOOP;

  IF v_has_addon_lines THEN
    FOR v_line IN
      SELECT *
      FROM jsonb_to_recordset(p_line_items) AS x(description text, quantity int, unit_price numeric)
    LOOP
      v_line_desc_in := trim(v_line.description);
      v_line_qty := v_line.quantity;
      v_line_unit := round(v_line.unit_price::numeric, 2);
      v_line_total := round(v_line_qty * v_line_unit, 2);

      INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price, total_price, line_total, service_type
      ) VALUES (
        v_invoice_id, v_line_desc_in, v_line_qty, v_line_unit, v_line_total, v_line_total, 'other'
      );

      v_addons_subtotal := v_addons_subtotal + v_line_total;
    END LOOP;
  END IF;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.name INTO v_pet_name FROM pets p WHERE p.id = v_pet_id AND p.owner_id = p_owner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    INSERT INTO service_credits (
      pet_id, service_code, units_total, expires_at, source_type, source_ref_id,
      purchase_group_id, is_bonus
    ) VALUES (
      v_pet_id, p_service_code, p_units, v_expires,
      'package_purchase', v_invoice_id, v_purchase_group_id, false
    );

    v_credits_count := v_credits_count + 1;
  END LOOP;

  v_subtotal := v_daycare_subtotal + v_addons_subtotal;

  IF v_pet_count >= 2 AND v_daycare_subtotal > 0 THEN
    v_discount := round(v_daycare_subtotal * v_multi_pet_discount_pct / 100.0, 2);

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
      'Multi-pet package discount ' || v_multi_pet_discount_pct::text || '% on daycare (' || v_pet_count::text || ' pets)',
      'system'
    );
  END IF;

  v_total := v_subtotal - v_discount;

  UPDATE invoices
  SET subtotal = v_subtotal,
      discount_pct = 0,
      discount_amount = v_discount,
      total = v_total,
      vat_aed = CASE WHEN v_total > 0 THEN round(v_total - (v_total / 1.05), 2) ELSE 0 END,
      status = CASE WHEN v_total = 0 THEN 'paid'::invoice_status ELSE status END,
      amount_paid = CASE WHEN v_total = 0 THEN 0 ELSE amount_paid END,
      paid_at = CASE WHEN v_total = 0 THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_purchase_group_id, v_total, v_discount, v_credits_count;
END
$function$;

-- Verification
SELECT code, multi_pet_discount_pct FROM package_definitions WHERE code = 'custom_daycare';

SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'issue_custom_daycare_package'
ORDER BY pronargs;
