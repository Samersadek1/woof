-- Fix RPCs still referencing dropped invoices.subtotal_aed / discount_aed / total_aed columns.

-- ── consolidate_owner_invoices ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consolidate_owner_invoices(
  p_owner_id uuid,
  p_invoice_ids uuid[],
  p_performed_by text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_invoice_id uuid;
  v_src record;
  v_line record;
  v_adj record;
  v_total_paid numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_vat_aed numeric := 0;
  v_new_status invoice_status;
  v_open_statuses invoice_status[] := ARRAY[
    'draft'::invoice_status,
    'finalised'::invoice_status,
    'issued'::invoice_status,
    'outstanding'::invoice_status,
    'overdue'::invoice_status,
    'partially_paid'::invoice_status
  ];
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'consolidate_owner_invoices requires authenticated user';
  END IF;

  IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Select at least two invoices to consolidate';
  END IF;

  IF nullif(trim(p_performed_by), '') IS NULL THEN
    RAISE EXCEPTION 'p_performed_by is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND (i.owner_id <> p_owner_id OR i.status = ANY (ARRAY['voided'::invoice_status, 'cancelled'::invoice_status, 'paid'::invoice_status]))
  ) THEN
    RAISE EXCEPTION 'All selected invoices must belong to the owner and be open (not paid/voided/cancelled)';
  END IF;

  IF (
    SELECT count(DISTINCT i.id)
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND i.owner_id = p_owner_id
      AND i.status = ANY (v_open_statuses)
  ) <> array_length(p_invoice_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected invoices were not found or are not eligible';
  END IF;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, discount_amount, total, vat_aed, amount_paid, service_type, notes
  ) VALUES (
    p_owner_id,
    CURRENT_DATE,
    'finalised'::invoice_status,
    0, 0, 0, 0, 0,
    'consolidated',
    'Consolidated invoice created by ' || trim(p_performed_by)
  )
  RETURNING id INTO v_new_invoice_id;

  FOR v_src IN
    SELECT i.*
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
    ORDER BY i.created_at
  LOOP
    v_total_paid := v_total_paid + coalesce(v_src.amount_paid, 0);
    v_subtotal := v_subtotal + coalesce(v_src.subtotal, 0);
    v_discount := v_discount + coalesce(v_src.discount_amount, 0);
    v_total := v_total + coalesce(v_src.total, 0);
    v_vat_aed := v_vat_aed + coalesce(v_src.vat_aed, 0);

    FOR v_line IN
      SELECT * FROM invoice_line_items WHERE invoice_id = v_src.id ORDER BY sort_order NULLS LAST, created_at
    LOOP
      INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price, total_price, line_total, service_type, pricing_key, sort_order
      ) VALUES (
        v_new_invoice_id,
        coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ': ' || v_line.description,
        v_line.quantity,
        v_line.unit_price,
        v_line.total_price,
        coalesce(v_line.line_total, v_line.total_price),
        v_line.service_type,
        v_line.pricing_key,
        v_line.sort_order
      );
    END LOOP;

    FOR v_adj IN
      SELECT * FROM billing_adjustments WHERE invoice_id = v_src.id
    LOOP
      INSERT INTO billing_adjustments (
        owner_id, invoice_id, adjustment_type, original_amount, adjusted_amount, reason, approved_by
      ) VALUES (
        p_owner_id,
        v_new_invoice_id,
        v_adj.adjustment_type,
        v_adj.original_amount,
        v_adj.adjusted_amount,
        coalesce(v_adj.reason, '') || ' (from ' || coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ')',
        coalesce(v_adj.approved_by, trim(p_performed_by))
      );
    END LOOP;

    UPDATE invoices
    SET status = 'voided',
        voided_at = now(),
        voided_reason = 'Consolidated into invoice ' || v_new_invoice_id::text
    WHERE id = v_src.id;
  END LOOP;

  IF v_total_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'paid'::invoice_status;
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid'::invoice_status;
  ELSE
    v_new_status := 'finalised'::invoice_status;
  END IF;

  UPDATE invoices
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      total = v_total,
      vat_aed = v_vat_aed,
      amount_paid = v_total_paid,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid'::invoice_status THEN now() ELSE NULL END
  WHERE id = v_new_invoice_id;

  INSERT INTO invoice_consolidation_log (owner_id, consolidated_invoice_id, source_invoice_ids, performed_by)
  VALUES (p_owner_id, v_new_invoice_id, p_invoice_ids, trim(p_performed_by));

  RETURN v_new_invoice_id;
END
$function$;

-- ── purchase_package (4-arg overload; 5-arg already canonical) ──────────────
CREATE OR REPLACE FUNCTION public.purchase_package(
  p_owner_id uuid,
  p_package_code text,
  p_pet_ids uuid[],
  p_payment_method payment_method DEFAULT 'card'::payment_method
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
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.purchase_package(
    p_owner_id,
    p_package_code,
    p_pet_ids,
    p_payment_method,
    CURRENT_DATE
  );
END
$function$;

-- ── issue_custom_daycare_package (8-arg) ────────────────────────────────────
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
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.issue_custom_daycare_package(
    p_owner_id,
    p_pet_ids,
    p_units,
    p_amount_aed,
    p_label,
    p_validity_months,
    p_payment_method,
    p_service_code,
    CURRENT_DATE
  );
END
$function$;

-- ── issue_custom_daycare_package (9-arg with backdate) ──────────────────────
CREATE OR REPLACE FUNCTION public.issue_custom_daycare_package(
  p_owner_id uuid,
  p_pet_ids uuid[],
  p_units integer,
  p_amount_aed numeric DEFAULT 0,
  p_label text DEFAULT 'Custom daycare package'::text,
  p_validity_months integer DEFAULT 6,
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_service_code service_code DEFAULT 'daycare_full_day'::service_code,
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
  v_issue date := coalesce(p_issue_date, CURRENT_DATE);
  v_expires date;
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

  SELECT id INTO v_package_def_id FROM package_definitions WHERE code = 'custom_daycare';
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
    CASE WHEN v_amount = 0 THEN 'paid'::invoice_status ELSE 'issued'::invoice_status END,
    0, 0, 0, 0,
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

    v_subtotal := v_subtotal + v_amount;

    INSERT INTO service_credits (
      pet_id, service_code, units_total, expires_at, source_type, source_ref_id,
      purchase_group_id, is_bonus
    ) VALUES (
      v_pet_id, p_service_code, p_units, v_expires,
      'package_purchase', v_invoice_id, v_purchase_group_id, false
    );

    v_credits_count := v_credits_count + 1;
  END LOOP;

  v_total := v_subtotal;

  UPDATE invoices
  SET subtotal = v_subtotal,
      discount_pct = 0,
      discount_amount = 0,
      total = v_total,
      vat_aed = CASE WHEN v_total > 0 THEN round(v_total - (v_total / 1.05), 2) ELSE 0 END,
      amount_paid = CASE WHEN v_total = 0 THEN 0 ELSE amount_paid END,
      paid_at = CASE WHEN v_total = 0 THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_purchase_group_id, v_total, 0::numeric, v_credits_count;
END
$function$;

-- ── create_assessment_booking ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_assessment_booking(
  p_pet_id uuid,
  p_session_date date,
  p_session_start_time time without time zone,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE(booking_id uuid, invoice_id uuid, amount_aed numeric)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid;
  v_booking_id uuid;
  v_invoice_id uuid;
  v_amount numeric;
BEGIN
  IF EXTRACT(ISODOW FROM p_session_date) > 5 THEN
    RAISE EXCEPTION 'Assessment sessions are Mon-Fri only';
  END IF;

  IF p_session_start_time NOT IN (
    '10:00'::time,
    '11:00'::time,
    '12:00'::time,
    '13:00'::time,
    '14:00'::time
  ) THEN
    RAISE EXCEPTION 'Assessment slot must be 10:00, 11:00, 12:00, 13:00, or 14:00';
  END IF;

  SELECT owner_id
  INTO v_owner_id
  FROM public.pets
  WHERE id = p_pet_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Pet % not found', p_pet_id;
  END IF;

  SELECT r.amount_aed
  INTO v_amount
  FROM public.resolve_woof_service_rate(
    'assessment_with_first_hour'::public.service_code,
    NULL,
    NULL,
    p_session_date
  ) AS r
  LIMIT 1;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Missing rate for assessment_with_first_hour on %', p_session_date;
  END IF;

  INSERT INTO public.bookings (
    owner_id,
    room_id,
    check_in_date,
    check_out_date,
    booking_type,
    status,
    staff_id,
    notes,
    agent_notes
  ) VALUES (
    v_owner_id,
    NULL,
    p_session_date,
    p_session_date + 1,
    'assessment'::public.booking_type,
    'confirmed'::public.booking_status,
    p_staff_id,
    p_notes,
    'Assessment session ' || p_session_start_time::text
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_pets (booking_id, pet_id)
  VALUES (v_booking_id, p_pet_id);

  UPDATE public.pets
  SET
    assessment_status = 'scheduled'::public.assessment_status,
    assessment_date = p_session_date
  WHERE id = p_pet_id;

  INSERT INTO public.invoices (
    owner_id,
    booking_id,
    issue_date,
    status,
    subtotal,
    total,
    vat_aed,
    service_type
  ) VALUES (
    v_owner_id,
    v_booking_id,
    CURRENT_DATE,
    'issued'::public.invoice_status,
    v_amount,
    v_amount,
    0,
    'assessment'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    total_price,
    service_type
  ) VALUES (
    v_invoice_id,
    'Assessment + 1hr Daycare (' || p_session_start_time::text || ')',
    1,
    v_amount,
    v_amount,
    'assessment'
  );

  RETURN QUERY SELECT v_booking_id, v_invoice_id, v_amount;
END
$function$;

-- ── auto_invoice_registration_on_pass ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_invoice_registration_on_pass()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_prior_passed INT;
  v_is_free BOOLEAN;
  v_fee NUMERIC := 500;
  v_invoice_id UUID;
  v_branch_id UUID;
  v_has_branch_column BOOLEAN := FALSE;
  v_total numeric;
  v_vat numeric;
BEGIN
  IF NEW.assessment_status IS DISTINCT FROM 'passed' THEN
    RETURN NEW;
  END IF;

  IF NEW.registration_invoiced = TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assessment_status = 'passed' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_prior_passed
  FROM pets
  WHERE owner_id = NEW.owner_id
    AND assessment_status = 'passed'
    AND registration_invoiced = TRUE
    AND id <> NEW.id;

  v_is_free := ((v_prior_passed + 1) % 3 = 0);

  BEGIN
    IF to_regclass('public.service_rates') IS NOT NULL THEN
      SELECT sr.amount_aed
      INTO v_fee
      FROM service_rates sr
      WHERE sr.service_code = 'registration_member'
        AND sr.is_active = TRUE
        AND sr.pet_size IS NULL
        AND sr.coat_type IS NULL
        AND sr.season IS NULL
      ORDER BY sr.updated_at DESC NULLS LAST
      LIMIT 1;
    ELSIF to_regclass('public.pricing') IS NOT NULL THEN
      SELECT p.amount_aed
      INTO v_fee
      FROM pricing p
      WHERE p.key = 'registration_member'
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fee := 500;
  END;

  v_fee := COALESCE(v_fee, 500);
  v_total := ROUND(v_fee * 1.05, 2);
  v_vat := ROUND(v_fee * 0.05, 2);

  IF v_is_free THEN
    NEW.registration_invoiced := TRUE;
    RETURN NEW;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL
     AND to_regclass('public.booking_pets') IS NOT NULL THEN
    BEGIN
      SELECT b.branch_id
      INTO v_branch_id
      FROM booking_pets bp
      JOIN bookings b ON b.id = bp.booking_id
      WHERE bp.pet_id = NEW.id
        AND b.booking_type = 'assessment'
      ORDER BY b.created_at DESC NULLS LAST
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  END IF;

  IF v_branch_id IS NULL
     AND to_regclass('public.park_bookings') IS NOT NULL THEN
    BEGIN
      SELECT pb.branch_id
      INTO v_branch_id
      FROM park_bookings pb
      WHERE pb.pet_id = NEW.id
        AND pb.is_assessment = TRUE
      ORDER BY pb.created_at DESC NULLS LAST
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  END IF;

  IF v_branch_id IS NULL
     AND to_regclass('public.branches') IS NOT NULL THEN
    BEGIN
      SELECT b.id
      INTO v_branch_id
      FROM branches b
      WHERE COALESCE(b.is_default, FALSE) = TRUE
      ORDER BY b.created_at ASC NULLS LAST
      LIMIT 1;
      IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
        FROM branches b
        ORDER BY b.created_at ASC NULLS LAST
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'branch_id'
  )
  INTO v_has_branch_column;

  IF v_has_branch_column THEN
    INSERT INTO invoices (
      owner_id,
      branch_id,
      status,
      subtotal,
      discount_amount,
      discount_pct,
      total,
      vat_aed,
      service_type,
      notes
    ) VALUES (
      NEW.owner_id,
      v_branch_id,
      'finalised',
      v_fee,
      0,
      0,
      v_total,
      v_vat,
      'membership',
      'Registration fee for ' || COALESCE(NEW.name, 'pet ' || NEW.id::text) || ' (assessment passed on ' || COALESCE(NEW.assessment_date, CURRENT_DATE) || ')'
    )
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO invoices (
      owner_id,
      status,
      subtotal,
      discount_amount,
      discount_pct,
      total,
      vat_aed,
      service_type,
      notes
    ) VALUES (
      NEW.owner_id,
      'finalised',
      v_fee,
      0,
      0,
      v_total,
      v_vat,
      'membership',
      'Registration fee for ' || COALESCE(NEW.name, 'pet ' || NEW.id::text) || ' (assessment passed on ' || COALESCE(NEW.assessment_date, CURRENT_DATE) || ')'
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO invoice_line_items (
    invoice_id,
    description,
    pricing_key,
    quantity,
    unit_price,
    total_price
  ) VALUES (
    v_invoice_id,
    'Registration fee — ' || COALESCE(NEW.name, 'Unnamed pet'),
    'registration_member',
    1,
    v_fee,
    v_fee
  );

  NEW.registration_invoiced := TRUE;
  RETURN NEW;
END
$function$;

-- Verification (paste result back after apply):
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.prosrc ILIKE '%subtotal_aed%'
-- ORDER BY 1, 2;
