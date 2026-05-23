BEGIN;

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
      subtotal_aed,
      discount_amount,
      discount_aed,
      discount_pct,
      total,
      total_aed,
      vat_aed,
      service_type,
      notes
    )
    VALUES (
      NEW.owner_id,
      v_branch_id,
      'finalised',
      v_fee,
      v_fee,
      0,
      0,
      0,
      ROUND(v_fee * 1.05, 2),
      ROUND(v_fee * 1.05, 2),
      ROUND(v_fee * 0.05, 2),
      'membership',
      'Registration fee for ' || COALESCE(NEW.name, 'pet ' || NEW.id::text) || ' (assessment passed on ' || COALESCE(NEW.assessment_date, CURRENT_DATE) || ')'
    )
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO invoices (
      owner_id,
      status,
      subtotal,
      subtotal_aed,
      discount_amount,
      discount_aed,
      discount_pct,
      total,
      total_aed,
      vat_aed,
      service_type,
      notes
    )
    VALUES (
      NEW.owner_id,
      'finalised',
      v_fee,
      v_fee,
      0,
      0,
      0,
      ROUND(v_fee * 1.05, 2),
      ROUND(v_fee * 1.05, 2),
      ROUND(v_fee * 0.05, 2),
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
  )
  VALUES (
    v_invoice_id,
    'Registration fee — ' || COALESCE(NEW.name, 'Unnamed pet'),
    'registration_member',
    1,
    v_fee,
    v_fee
  );

  NEW.registration_invoiced := TRUE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_invoice_registration ON public.pets;
CREATE TRIGGER trg_auto_invoice_registration
  BEFORE UPDATE ON public.pets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_invoice_registration_on_pass();

COMMIT;
