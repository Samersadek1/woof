-- Add optional backdate to purchase_package (preserves phase 3b logic)

CREATE OR REPLACE FUNCTION public.purchase_package(
  p_owner_id uuid,
  p_package_code text,
  p_pet_ids uuid[],
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_issue_date date DEFAULT CURRENT_DATE
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
  v_issue date := coalesce(p_issue_date, CURRENT_DATE);
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'purchase_package requires authenticated user';
  END IF;

  IF v_issue > CURRENT_DATE THEN
    RAISE EXCEPTION 'p_issue_date cannot be in the future';
  END IF;

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
    p_owner_id, v_issue, 'issued'::invoice_status, 0, 0, 0, p_payment_method, 'package'
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
              to_jsonb(gen_random_uuid()::text),
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
        (v_issue + (v_validity_months || ' months')::interval)::date,
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
$function$;

SELECT pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'purchase_package';
