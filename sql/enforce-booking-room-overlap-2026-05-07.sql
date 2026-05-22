BEGIN;

-- Enforce room availability for boarding bookings.
-- Rules:
--   1) Overlap in same room is blocked for different owners.
--   2) Overlap in same room is allowed when owner is the same.
--   3) Cancelled bookings do not block availability.
--   4) Date occupancy semantics are [check_in_date, check_out_date).
CREATE OR REPLACE FUNCTION enforce_boarding_room_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict RECORD;
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

  IF public.is_import_placeholder_room_id(NEW.room_id) THEN
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
    RAISE EXCEPTION 'Room % is already booked for those dates', NEW.room_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_boarding_room_overlap ON bookings;
CREATE TRIGGER trg_enforce_boarding_room_overlap
  BEFORE INSERT OR UPDATE OF room_id, owner_id, check_in_date, check_out_date, status, booking_type
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_boarding_room_overlap();

COMMIT;
