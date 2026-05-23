BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_pet_assessment_on_booking_pet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status assessment_status;
  v_pet_name text;
  v_booking_type booking_type;
BEGIN
  SELECT b.booking_type
  INTO v_booking_type
  FROM bookings b
  WHERE b.id = NEW.booking_id;

  -- Assessment and grooming workflows are allowed pre-assessment.
  IF v_booking_type IN ('grooming', 'assessment') THEN
    RETURN NEW;
  END IF;

  SELECT p.assessment_status, p.name
  INTO v_status, v_pet_name
  FROM pets p
  WHERE p.id = NEW.pet_id;

  IF v_status IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION
      'Pet % has not passed behavioural assessment (status=%). Book an assessment via the Park calendar before scheduling %.',
      COALESCE(v_pet_name, NEW.pet_id::text),
      v_status,
      COALESCE(v_booking_type::text, 'booking')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_pet_assessment_booking_pets ON public.booking_pets;
CREATE TRIGGER trg_enforce_pet_assessment_booking_pets
  BEFORE INSERT OR UPDATE OF booking_id, pet_id
  ON public.booking_pets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pet_assessment_on_booking_pet();

COMMIT;
