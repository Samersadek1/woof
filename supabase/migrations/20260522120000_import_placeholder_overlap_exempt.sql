-- Unassigned / tier placeholder rooms (UNK-*) may hold many overlapping import stays.

CREATE OR REPLACE FUNCTION public.is_import_placeholder_room_id(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = p_room_id
      AND (
        r.wing = 'import_placeholder'::public.room_wing
        OR r.room_number LIKE 'UNK-%'
        OR COALESCE(r.notes, '') ILIKE '%import_placeholder_tier=%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_boarding_room_overlap()
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

  -- Tier / unknown kennel placeholders: unlimited stacked bookings for PetExec backfill.
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
  FROM public.bookings b
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

DROP TRIGGER IF EXISTS trg_enforce_boarding_room_overlap ON public.bookings;
CREATE TRIGGER trg_enforce_boarding_room_overlap
  BEFORE INSERT OR UPDATE OF room_id, owner_id, check_in_date, check_out_date, status, booking_type
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_boarding_room_overlap();
