-- Boarding assignment night convention (single source of truth).
--
-- Bookings: occupied nights are [check_in_date, check_out_date) — checkout day has no overnight.
-- Assignment segments: end_date is the LAST occupied night (inclusive), i.e. check_out_date - 1
--   for a full-stay segment. Coverage: start_date <= night AND night <= end_date.
--
-- Do not mix with half-open segment end_date (= check_out_date); live rows use inclusive last night.

BEGIN;

CREATE OR REPLACE FUNCTION public.woof_assignment_covers_night(
  p_start date,
  p_end date,
  p_night date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $$
  SELECT p_start <= p_night AND p_night <= p_end;
$$;

CREATE OR REPLACE FUNCTION public.woof_booking_night_overlaps_assignment(
  p_check_in date,
  p_check_out date,
  p_seg_start date,
  p_seg_end date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $$
  SELECT p_seg_start < p_check_out AND p_seg_end >= p_check_in;
$$;

CREATE OR REPLACE FUNCTION public.woof_boarding_night_capacity(p_date date)
RETURNS TABLE (
  large_rooms int,
  standard_rooms int,
  large_required int,
  total_bookings int,
  large_free int,
  total_free int,
  assigned int,
  unassigned int,
  feasible boolean,
  reason text
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  WITH rms AS (
    SELECT
      count(*) FILTER (WHERE size_class = 'large')::int AS large_rooms,
      count(*) FILTER (WHERE size_class = 'standard')::int AS standard_rooms
    FROM public.rooms
    WHERE size_class IS NOT NULL
      AND coalesce(is_active, true)
  ),
  demand AS (
    SELECT
      b.id,
      rc.required_class,
      EXISTS (
        SELECT 1
        FROM public.booking_room_assignments ra
        WHERE ra.booking_id = b.id
          AND ra.room_id IS NOT NULL
          AND public.woof_assignment_covers_night(ra.start_date, ra.end_date, p_date)
      ) AS is_assigned
    FROM public.bookings b
    JOIN public.woof_v_booking_required_class rc ON rc.booking_id = b.id
    WHERE b.booking_type = 'boarding'
      AND b.status IN ('confirmed', 'checked_in')
      AND b.check_in_date <= p_date
      AND p_date < b.check_out_date
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE required_class = 'large')::int AS large_required,
      count(*)::int AS total_bookings,
      count(*) FILTER (WHERE is_assigned)::int AS assigned
    FROM demand
  )
  SELECT
    rms.large_rooms,
    rms.standard_rooms,
    agg.large_required,
    agg.total_bookings,
    rms.large_rooms - agg.large_required AS large_free,
    (rms.large_rooms + rms.standard_rooms) - agg.total_bookings AS total_free,
    agg.assigned,
    agg.total_bookings - agg.assigned AS unassigned,
    (agg.large_required <= rms.large_rooms
      AND agg.total_bookings <= rms.large_rooms + rms.standard_rooms) AS feasible,
    CASE
      WHEN agg.large_required > rms.large_rooms THEN 'large section full'
      WHEN agg.total_bookings > rms.large_rooms + rms.standard_rooms THEN 'no rooms left'
      ELSE 'ok'
    END AS reason
  FROM rms, agg;
$$;

CREATE OR REPLACE FUNCTION public.woof_suggest_boarding_room(
  p_check_in date,
  p_check_out date,
  p_required_class public.room_size_class
)
RETURNS TABLE (
  room_id uuid,
  room_label text,
  size_class public.room_size_class,
  is_overflow boolean
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    r.id,
    coalesce(r.display_name, r.name, r.room_number) AS room_label,
    r.size_class,
    (p_required_class = 'standard' AND r.size_class = 'large') AS is_overflow
  FROM public.rooms r
  WHERE r.size_class IS NOT NULL
    AND coalesce(r.is_active, true)
    AND (
      r.size_class = p_required_class
      OR (p_required_class = 'standard' AND r.size_class = 'large')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_room_assignments ra
      WHERE ra.room_id = r.id
        AND ra.room_id IS NOT NULL
        AND public.woof_booking_night_overlaps_assignment(
          p_check_in,
          p_check_out,
          ra.start_date,
          ra.end_date
        )
    )
  ORDER BY
    (p_required_class = 'standard' AND r.size_class = 'large') ASC,
    r.size_class ASC,
    room_label ASC
  LIMIT 25;
$$;

CREATE OR REPLACE FUNCTION public.woof_validate_boarding_assignment(
  p_booking_id uuid,
  p_start date,
  p_end date,
  p_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO public
AS $$
DECLARE
  w jsonb := '[]'::jsonb;
  v_req public.room_size_class;
  v_room public.rooms%ROWTYPE;
BEGIN
  SELECT required_class INTO v_req
  FROM public.woof_v_booking_required_class
  WHERE booking_id = p_booking_id;

  IF p_room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
      w := w || jsonb_build_object('code', 'room_missing', 'msg', 'Room not found');
    ELSE
      IF v_room.size_class IS NULL THEN
        w := w || jsonb_build_object('code', 'not_boarding', 'msg', 'Room is not a dog-boarding room');
      END IF;
      IF NOT coalesce(v_room.is_active, true) THEN
        w := w || jsonb_build_object('code', 'inactive', 'msg', 'Room is inactive');
      END IF;
      IF v_req = 'large' AND v_room.size_class = 'standard' THEN
        w := w || jsonb_build_object(
          'code', 'too_small',
          'msg', 'Booking needs a large room; this one is standard'
        );
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.booking_room_assignments ra
        WHERE ra.room_id = p_room_id
          AND ra.booking_id <> p_booking_id
          AND public.woof_booking_night_overlaps_assignment(
            p_start,
            p_end + 1,
            ra.start_date,
            ra.end_date
          )
      ) THEN
        w := w || jsonb_build_object(
          'code', 'double_booked',
          'msg', 'Another booking holds this room in that range'
        );
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generate_series(p_start, p_end, interval '1 day') d
    CROSS JOIN LATERAL public.woof_boarding_night_capacity(d::date) c
    WHERE NOT c.feasible
  ) THEN
    w := w || jsonb_build_object(
      'code', 'over_capacity',
      'msg', 'One or more nights are over capacity'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(w) = 0,
    'required_class', v_req,
    'warnings', w
  );
END;
$$;

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
        AND public.woof_assignment_covers_night(ra.start_date, ra.end_date, p_date)
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

GRANT EXECUTE ON FUNCTION public.woof_assignment_covers_night(date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_booking_night_overlaps_assignment(date, date, date, date) TO authenticated, service_role;

COMMIT;

-- Verification (last night of a stay should show assigned when end_date = check_out - 1):
-- WITH b AS (
--   SELECT id, check_in_date, check_out_date FROM bookings
--   WHERE booking_type = 'boarding' AND status IN ('confirmed','checked_in')
--     AND check_out_date > current_date LIMIT 1
-- )
-- SELECT b.check_out_date - 1 AS last_night,
--   EXISTS (
--     SELECT 1 FROM booking_room_assignments ra
--     WHERE ra.booking_id = b.id AND ra.room_id IS NOT NULL
--       AND public.woof_assignment_covers_night(ra.start_date, ra.end_date, b.check_out_date - 1)
--   ) AS covered_on_last_night
-- FROM b;
