-- Allow multiple PetExec import rows on the same UNK placeholder room (calendar backfill).

CREATE OR REPLACE FUNCTION enforce_boarding_room_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict RECORD;
  v_wing public.room_wing;
BEGIN
  IF COALESCE(NEW.booking_type, 'boarding') <> 'boarding' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.room_id IS NULL OR NEW.owner_id IS NULL OR NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.wing INTO v_wing FROM public.rooms r WHERE r.id = NEW.room_id;
  IF v_wing = 'import_placeholder' THEN
    RETURN NEW;
  END IF;

  SELECT
    b.id,
    b.owner_id,
    b.check_in_date,
    b.check_out_date,
    b.status
  INTO v_conflict
  FROM bookings b
  WHERE b.room_id = NEW.room_id
    AND (NEW.id IS NULL OR b.id <> NEW.id)
    AND b.status <> 'cancelled'
    AND COALESCE(b.booking_type, 'boarding') = 'boarding'
    AND b.owner_id <> NEW.owner_id
    AND daterange(b.check_in_date, b.check_out_date, '[)') && daterange(NEW.check_in_date, NEW.check_out_date, '[)')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_OVERLAP_CONFLICT'
      USING ERRCODE = 'check_violation',
            DETAIL = format(
              'Room %s already has booking %s (%s to %s) for a different owner.',
              NEW.room_id,
              v_conflict.id,
              v_conflict.check_in_date,
              v_conflict.check_out_date
            ),
            HINT = 'Choose another room or non-overlapping dates.';
  END IF;

  RETURN NEW;
END;
$$;
