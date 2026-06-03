-- Extend room size_class backfill for split daycare zones + DC spaces labels.

CREATE OR REPLACE FUNCTION public.woof_backfill_room_size_class()
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  UPDATE public.rooms r
  SET size_class = NULL
  WHERE COALESCE(r.is_active, true)
    AND (
      r.wing = 'import_placeholder'::public.room_wing
      OR public.is_boarding_import_placeholder_room(r)
      OR r.wing = 'cattery'::public.room_wing
      OR r.room_type::text = 'kitchen'
      OR r.room_type::text LIKE 'cattery%'
    );

  UPDATE public.rooms r
  SET size_class = 'large'::public.room_size_class
  WHERE COALESCE(r.is_active, true)
    AND COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Grooming%';

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class
  WHERE COALESCE(r.is_active, true)
    AND (
      r.zone IN ('Daycare 1', 'Daycare 2', 'Daycare 3', 'Daycare Spaces', 'Overflow')
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Daycare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Dcare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Upstairs Dcare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Overflow%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'DC %'
    );

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class
  WHERE public.woof_is_boarding_capacity_room(r)
    AND COALESCE(r.room_number, '') ~ '^[ABC][0-9]+$'
    AND (r.zone IS NULL OR r.zone NOT IN ('Daycare 1', 'Daycare 2', 'Daycare 3', 'Daycare Spaces'));

  UPDATE public.rooms r
  SET size_class = 'large'::public.room_size_class
  WHERE public.woof_is_boarding_capacity_room(r)
    AND (
      COALESCE(r.room_number, '') ~ '^D([1-9]|1[0-3])$'
      OR COALESCE(r.room_number, '') ~ '^Dw[0-9]+$'
    );
END;
$$;

SELECT public.woof_backfill_room_size_class();

-- Verification
SELECT zone, count(*)::int AS room_count
FROM public.rooms
WHERE zone IN ('Daycare 1', 'Daycare 2', 'Daycare 3', 'Daycare Spaces', 'Overflow')
GROUP BY zone
ORDER BY zone;
