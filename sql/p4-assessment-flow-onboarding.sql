BEGIN;

-- ============================================================
-- 1. Enums
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_status') THEN
    CREATE TYPE assessment_status AS ENUM ('not_assessed', 'scheduled', 'passed', 'failed');
  ELSE
    BEGIN ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'not_assessed'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'scheduled'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'passed'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'failed'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_type') THEN
    CREATE TYPE booking_type AS ENUM (
      'boarding', 'daycare', 'park', 'grooming', 'transport', 'training', 'assessment'
    );
  ELSE
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'boarding'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'daycare'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'park'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'grooming'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'transport'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'training'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'assessment'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- ============================================================
-- 2. Pet column additions
-- ============================================================

ALTER TABLE pets ADD COLUMN IF NOT EXISTS assessment_date DATE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS assessment_notes TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS assessed_by TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS size_category pet_size_category;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS registration_invoiced BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE pets
SET assessment_status = 'not_assessed'
WHERE assessment_status IS NULL;

-- ============================================================
-- 3. Booking column additions
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type booking_type;

-- ============================================================
-- 4. CRITICAL: protect migrated data before triggers go live
-- ============================================================

UPDATE pets
SET assessment_status = 'passed',
    assessment_date = COALESCE(assessment_date, CURRENT_DATE),
    assessed_by = COALESCE(assessed_by, 'legacy_migration'),
    assessment_notes = COALESCE(assessment_notes, 'Pre-existing client migrated from Pet Exec — assessment grandfathered.'),
    registration_invoiced = TRUE
WHERE registration_invoiced = FALSE
  AND assessment_status = 'not_assessed';

-- Defensive reconciliation for already-passed migrated pets that had
-- registration_invoiced left as FALSE prior to this migration.
UPDATE pets
SET registration_invoiced = TRUE,
    assessment_date = COALESCE(assessment_date, CURRENT_DATE),
    assessed_by = COALESCE(assessed_by, 'legacy_migration'),
    assessment_notes = COALESCE(assessment_notes, 'Pre-existing client migrated from Pet Exec — assessment grandfathered.')
WHERE assessment_status = 'passed'
  AND registration_invoiced = FALSE;

-- ============================================================
-- 5. Service gating trigger
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_pet_assessment_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Multi-pet bookings are enforced on booking_pets rows.
  -- Keep this trigger as a no-op guard for booking-level writes.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pet_assessment ON bookings;
CREATE TRIGGER trg_enforce_pet_assessment
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pet_assessment_on_booking();

-- Enforce assessment per linked pet (multi-pet bookings model).
CREATE OR REPLACE FUNCTION enforce_pet_assessment_on_booking_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status assessment_status;
  v_pet_name TEXT;
  v_booking_type booking_type;
BEGIN
  SELECT booking_type INTO v_booking_type
  FROM bookings
  WHERE id = NEW.booking_id;

  IF v_booking_type IN ('grooming', 'assessment') THEN
    RETURN NEW;
  END IF;

  SELECT assessment_status, name INTO v_status, v_pet_name
  FROM pets
  WHERE id = NEW.pet_id;

  IF v_status IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION 'Pet % has not passed behavioural assessment (status=%). Book an assessment via the Park calendar before scheduling %.',
      COALESCE(v_pet_name, NEW.pet_id::text), v_status, COALESCE(v_booking_type::text, 'booking')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pet_assessment_booking_pets ON booking_pets;
CREATE TRIGGER trg_enforce_pet_assessment_booking_pets
  BEFORE INSERT ON booking_pets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pet_assessment_on_booking_pet();

-- ============================================================
-- 6. Registration fee auto-invoice on assessment pass
-- ============================================================

CREATE OR REPLACE FUNCTION auto_invoice_registration_on_pass()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior_passed INT;
  v_is_free BOOLEAN;
  v_fee NUMERIC := 500;
  v_invoice_id UUID;
  v_branch_id UUID;
  v_has_branch_column BOOLEAN := FALSE;
  v_target_pet_id UUID := NEW.id;
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

  -- Prefer service-rates pricing key used by the app. Fall back to legacy pricing table.
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
      SELECT p.amount_aed INTO v_fee
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

  -- Derive branch from latest assessment booking (bookings + booking_pets).
  IF to_regclass('public.bookings') IS NOT NULL
     AND to_regclass('public.booking_pets') IS NOT NULL THEN
    BEGIN
      SELECT b.branch_id
      INTO v_branch_id
      FROM booking_pets bp
      JOIN bookings b ON b.id = bp.booking_id
      WHERE bp.pet_id = v_target_pet_id
        AND b.booking_type = 'assessment'
      ORDER BY b.created_at DESC NULLS LAST
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  END IF;

  -- Legacy fallback: park assessment booking source.
  IF v_branch_id IS NULL
     AND to_regclass('public.park_bookings') IS NOT NULL THEN
    BEGIN
      SELECT pb.branch_id
      INTO v_branch_id
      FROM park_bookings pb
      WHERE pb.pet_id = v_target_pet_id
        AND pb.is_assessment = TRUE
      ORDER BY pb.created_at DESC NULLS LAST
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  END IF;

  -- Final fallback: default branch.
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
    INSERT INTO invoices (owner_id, branch_id, status, subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct, total, total_aed, vat_aed, service_type, notes)
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
    INSERT INTO invoices (owner_id, status, subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct, total, total_aed, vat_aed, service_type, notes)
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

  INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price)
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
$$;

DROP TRIGGER IF EXISTS trg_auto_invoice_registration ON pets;
CREATE TRIGGER trg_auto_invoice_registration
  BEFORE UPDATE ON pets
  FOR EACH ROW
  EXECUTE FUNCTION auto_invoice_registration_on_pass();

COMMIT;
