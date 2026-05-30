-- Kennel map: room zone labels + unassigned boarding queue RPC.

BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS zone text;

CREATE OR REPLACE FUNCTION public.woof_backfill_room_size_class()
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  UPDATE public.rooms r
  SET size_class = NULL,
      zone = NULL
  WHERE COALESCE(r.is_active, true)
    AND (
      r.wing = 'import_placeholder'::public.room_wing
      OR public.is_boarding_import_placeholder_room(r)
      OR r.wing = 'cattery'::public.room_wing
      OR r.room_type::text = 'kitchen'
      OR r.room_type::text LIKE 'cattery%'
    );

  UPDATE public.rooms r
  SET size_class = 'large'::public.room_size_class,
      zone = 'Grooming'
  WHERE COALESCE(r.is_active, true)
    AND COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Grooming%';

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class,
      zone = 'Daycare'
  WHERE COALESCE(r.is_active, true)
    AND (
      COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Daycare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Dcare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Upstairs Dcare%'
    );

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class,
      zone = 'Overflow'
  WHERE COALESCE(r.is_active, true)
    AND COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Overflow%';

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class,
      zone = 'A'
  WHERE public.woof_is_boarding_capacity_room(r)
    AND COALESCE(r.room_number, '') ~ '^A[0-9]+$';

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class,
      zone = 'B'
  WHERE public.woof_is_boarding_capacity_room(r)
    AND COALESCE(r.room_number, '') ~ '^B[0-9]+$';

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class,
      zone = 'C'
  WHERE public.woof_is_boarding_capacity_room(r)
    AND COALESCE(r.room_number, '') ~ '^C[0-9]+$';

  UPDATE public.rooms r
  SET size_class = 'large'::public.room_size_class,
      zone = 'D'
  WHERE public.woof_is_boarding_capacity_room(r)
    AND (
      COALESCE(r.room_number, '') ~ '^D([1-9]|1[0-3])$'
      OR COALESCE(r.room_number, '') ~ '^Dw[0-9]+$'
    );
END;
$$;

SELECT public.woof_backfill_room_size_class();

CREATE OR REPLACE FUNCTION public.woof_unassigned_boarding(p_date date)
RETURNS TABLE (
  booking_id uuid,
  booking_ref text,
  owner_id uuid,
  owner_name text,
  dog_names text,
  pet_count int,
  required_class public.room_size_class,
  has_restriction boolean,
  check_in_date date,
  check_out_date date,
  do_not_move boolean,
  arrival text
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    b.id,
    b.booking_ref,
    b.owner_id,
    trim(concat_ws(' ', o.first_name, o.last_name)) AS owner_name,
    string_agg(p.name, ', ' ORDER BY p.name) AS dog_names,
    count(*)::int AS pet_count,
    rc.required_class,
    rc.has_restriction,
    b.check_in_date,
    b.check_out_date,
    COALESCE(b.do_not_move, false) AS do_not_move,
    CASE
      WHEN b.check_in_date = p_date THEN 'arriving_today'
      WHEN b.actual_check_in_at IS NOT NULL THEN 'here_now'
      ELSE 'upcoming'
    END AS arrival
  FROM public.bookings b
  JOIN public.woof_v_booking_required_class rc ON rc.booking_id = b.id
  JOIN public.booking_pets bp ON bp.booking_id = b.id
  JOIN public.pets p ON p.id = bp.pet_id
  JOIN public.owners o ON o.id = b.owner_id
  WHERE b.booking_type = 'boarding'
    AND b.status IN ('confirmed', 'checked_in')
    AND b.check_in_date <= p_date
    AND p_date < b.check_out_date
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_room_assignments ra
      WHERE ra.booking_id = b.id
        AND ra.room_id IS NOT NULL
        AND ra.start_date <= p_date
        AND ra.end_date >= p_date
    )
  GROUP BY
    b.id,
    b.booking_ref,
    b.owner_id,
    o.first_name,
    o.last_name,
    rc.required_class,
    rc.has_restriction,
    b.check_in_date,
    b.check_out_date,
    b.do_not_move,
    b.actual_check_in_at
  ORDER BY
    (rc.required_class = 'large') DESC,
    b.check_in_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.woof_unassigned_boarding(date) TO authenticated, service_role;

COMMIT;

-- Verification:
-- SELECT zone, size_class, count(*) FROM public.rooms WHERE size_class IS NOT NULL GROUP BY 1, 2 ORDER BY 1;
-- SELECT count(*) FROM public.woof_unassigned_boarding(current_date);
-- SELECT * FROM public.woof_boarding_night_capacity(current_date);
