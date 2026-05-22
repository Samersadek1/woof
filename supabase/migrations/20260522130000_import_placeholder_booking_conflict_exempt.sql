-- check_booking_conflict also blocked stacked UNK / import_placeholder stays.

CREATE OR REPLACE FUNCTION public.check_booking_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.is_import_placeholder_room_id(NEW.room_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE room_id = NEW.room_id
      AND id IS DISTINCT FROM NEW.id
      AND status NOT IN ('cancelled', 'checked_out', 'no_show')
      AND (NEW.check_in_date, NEW.check_out_date) OVERLAPS (check_in_date, check_out_date)
  ) THEN
    RAISE EXCEPTION 'Room % is already booked for those dates', NEW.room_id;
  END IF;

  RETURN NEW;
END;
$function$;
