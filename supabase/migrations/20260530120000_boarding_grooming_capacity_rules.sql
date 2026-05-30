-- Boarding size-class capacity + grooming station-minute capacity (alert-only validate RPCs).
-- Assignment nights (inclusive end): start_date <= night <= end_date (end_date = last occupied night).
-- Booking stay nights (half-open): check_in_date <= night < check_out_date (checkout day not occupied).
-- See woof_assignment_covers_night() in 20260530150000_boarding_assignment_night_convention.sql.

BEGIN;

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.room_size_class AS ENUM ('standard', 'large');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.room_restriction_type AS ENUM ('none', 'large_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Columns ───────────────────────────────────────────────────────────────────
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS size_class public.room_size_class;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS room_restriction public.room_restriction_type NOT NULL DEFAULT 'none';

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS restriction_reason text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS restriction_set_by text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS restriction_set_at timestamptz;

-- ── Audit / override tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.boarding_assignment_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  overridden_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boarding_assignment_overrides_booking_idx
  ON public.boarding_assignment_overrides (booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.grooming_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.grooming_appointments(id) ON DELETE SET NULL,
  job_date date NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  overridden_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grooming_overrides_job_date_idx
  ON public.grooming_overrides (job_date, created_at DESC);

CREATE TABLE IF NOT EXISTS public.grooming_service_durations (
  service public.grooming_service NOT NULL,
  size text NOT NULL,
  default_minutes int NOT NULL,
  PRIMARY KEY (service, size)
);

INSERT INTO public.grooming_service_durations (service, size, default_minutes) VALUES
  ('full_groom', 'small', 60), ('full_groom', 'medium', 90), ('full_groom', 'large', 120),
  ('deshedding', 'small', 45), ('deshedding', 'medium', 60), ('deshedding', 'large', 90),
  ('full_bath', 'small', 30), ('full_bath', 'medium', 45), ('full_bath', 'large', 60),
  ('nail_clip', 'small', 15), ('nail_clip', 'medium', 15), ('nail_clip', 'large', 20),
  ('brushing', 'small', 20), ('brushing', 'medium', 30), ('brushing', 'large', 40)
ON CONFLICT (service, size) DO NOTHING;

ALTER TABLE public.boarding_assignment_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grooming_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grooming_service_durations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boarding_assignment_overrides_all" ON public.boarding_assignment_overrides;
CREATE POLICY "boarding_assignment_overrides_all"
  ON public.boarding_assignment_overrides FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_overrides_all" ON public.grooming_overrides;
CREATE POLICY "grooming_overrides_all"
  ON public.grooming_overrides FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_service_durations_read" ON public.grooming_service_durations;
CREATE POLICY "grooming_service_durations_read"
  ON public.grooming_service_durations FOR SELECT USING (true);

DROP POLICY IF EXISTS "grooming_service_durations_write" ON public.grooming_service_durations;
CREATE POLICY "grooming_service_durations_write"
  ON public.grooming_service_durations FOR ALL USING (true) WITH CHECK (true);

-- ── Room classification helpers ───────────────────────────────────────────────
-- Active boarding-capacity candidate (excludes cattery, kitchen, import placeholders only).
CREATE OR REPLACE FUNCTION public.woof_is_boarding_capacity_room(p_room public.rooms)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    public.is_kennel_occupancy_room(p_room)
    AND NOT public.is_boarding_import_placeholder_room(p_room)
    AND p_room.wing IS DISTINCT FROM 'import_placeholder'::public.room_wing
    AND p_room.wing IS DISTINCT FROM 'cattery'::public.room_wing
    AND p_room.room_type::text IS DISTINCT FROM 'kitchen'
    AND p_room.room_type::text NOT LIKE 'cattery%'
$$;

-- Idempotent full boarding pool classification. Safe to re-run.
--   standard — A/B/C grid, Daycare*, Dcare*, Upstairs Dcare*, Overflow*
--   large    — D1–D13, Dw*, Grooming*
--   NULL     — cattery, kitchen, import placeholders (UNK / Unknown · rows)
CREATE OR REPLACE FUNCTION public.woof_backfill_room_size_class()
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  -- Clear excluded rows so re-runs do not leave stale classes on placeholders.
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
      COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Daycare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Dcare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Upstairs Dcare%'
      OR COALESCE(r.display_name, r.name, r.room_number) ILIKE 'Overflow%'
    );

  UPDATE public.rooms r
  SET size_class = 'standard'::public.room_size_class
  WHERE public.woof_is_boarding_capacity_room(r)
    AND COALESCE(r.room_number, '') ~ '^[ABC][0-9]+$';

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

-- ── Boarding capacity logic ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.woof_dog_room_load(p_size text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $$
  SELECT CASE lower(coalesce(p_size, ''))
    WHEN 'small' THEN 1 WHEN 's' THEN 1
    WHEN 'medium' THEN 2 WHEN 'm' THEN 2
    WHEN 'large' THEN 3 WHEN 'l' THEN 3 WHEN 'xl' THEN 3
    ELSE 2
  END;
$$;

CREATE OR REPLACE FUNCTION public.woof_required_class(
  p_sizes text[],
  p_force_large boolean DEFAULT false
)
RETURNS public.room_size_class
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public
AS $$
DECLARE
  total int := 0;
  s text;
BEGIN
  IF p_force_large THEN
    RETURN 'large'::public.room_size_class;
  END IF;
  IF p_sizes IS NULL OR array_length(p_sizes, 1) IS NULL THEN
    RETURN 'standard'::public.room_size_class;
  END IF;
  FOREACH s IN ARRAY p_sizes LOOP
    total := total + public.woof_dog_room_load(s);
  END LOOP;
  RETURN CASE
    WHEN total > 2 THEN 'large'::public.room_size_class
    ELSE 'standard'::public.room_size_class
  END;
END;
$$;

CREATE OR REPLACE VIEW public.woof_v_booking_required_class
WITH (security_invoker = true) AS
SELECT
  b.id AS booking_id,
  public.woof_required_class(
    array_agg(p.size::text),
    bool_or(p.room_restriction = 'large_only')
  ) AS required_class,
  bool_or(p.room_restriction = 'large_only') AS has_restriction,
  count(*)::int AS pet_count
FROM public.bookings b
JOIN public.booking_pets bp ON bp.booking_id = b.id
JOIN public.pets p ON p.id = bp.pet_id
WHERE b.booking_type = 'boarding'
GROUP BY b.id;

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
          AND ra.start_date <= p_date
          AND ra.end_date >= p_date
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

CREATE OR REPLACE FUNCTION public.woof_boarding_range_feasibility(
  p_check_in date,
  p_check_out date,
  p_adding_class public.room_size_class DEFAULT NULL
)
RETURNS TABLE (
  stay_date date,
  large_free int,
  total_free int,
  feasible boolean,
  reason text
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    d::date,
    c.large_free - CASE WHEN p_adding_class = 'large' THEN 1 ELSE 0 END,
    c.total_free - CASE WHEN p_adding_class IS NOT NULL THEN 1 ELSE 0 END,
    CASE
      WHEN p_adding_class = 'large' THEN c.large_free >= 1 AND c.total_free >= 1
      WHEN p_adding_class = 'standard' THEN c.total_free >= 1
      ELSE c.feasible
    END,
    c.reason
  FROM generate_series(p_check_in, p_check_out - 1, interval '1 day') d
  CROSS JOIN LATERAL public.woof_boarding_night_capacity(d::date) c;
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
        AND ra.start_date < p_check_out
        AND p_check_in <= ra.end_date
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
          AND ra.start_date <= p_end
          AND p_start <= ra.end_date
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

-- ── Grooming capacity logic (default day window 08:00–18:00) ───────────────────
CREATE OR REPLACE FUNCTION public.woof_grooming_default_minutes(
  p_service public.grooming_service,
  p_size text
)
RETURNS int
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT coalesce(
    (
      SELECT default_minutes
      FROM public.grooming_service_durations
      WHERE service = p_service
        AND size = lower(p_size)
    ),
    45
  );
$$;

CREATE OR REPLACE FUNCTION public.woof_grooming_day_capacity(
  p_date date,
  p_day_start time DEFAULT '08:00',
  p_day_end time DEFAULT '18:00'
)
RETURNS TABLE (
  stations int,
  window_minutes int,
  total_minutes int,
  committed_minutes int,
  free_minutes int,
  pinned_minutes int,
  floating_minutes int,
  feasible boolean
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  WITH win AS (
    SELECT (EXTRACT(EPOCH FROM (p_day_end - p_day_start)) / 60)::int AS m
  ),
  st AS (
    SELECT count(*)::int AS n
    FROM public.grooming_stations
    WHERE coalesce(is_active, true)
  ),
  a AS (
    SELECT
      coalesce(sum(duration_minutes), 0)::int AS committed,
      coalesce(sum(duration_minutes) FILTER (WHERE appointment_time IS NOT NULL), 0)::int AS pinned,
      coalesce(sum(duration_minutes) FILTER (WHERE appointment_time IS NULL), 0)::int AS floating
    FROM public.grooming_appointments
    WHERE appointment_date = p_date
      AND coalesce(status, '') <> 'cancelled'
      AND coalesce(no_show, false) = false
  )
  SELECT
    st.n,
    win.m,
    st.n * win.m,
    a.committed,
    st.n * win.m - a.committed,
    a.pinned,
    a.floating,
    a.committed <= st.n * win.m
  FROM win, st, a;
$$;

CREATE OR REPLACE FUNCTION public.woof_grooming_station_load(
  p_date date,
  p_day_start time DEFAULT '08:00',
  p_day_end time DEFAULT '18:00'
)
RETURNS TABLE (
  station_id uuid,
  station_name text,
  window_minutes int,
  used_minutes int,
  free_minutes int
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    s.id,
    s.name,
    (EXTRACT(EPOCH FROM (p_day_end - p_day_start)) / 60)::int AS window_minutes,
    coalesce((
      SELECT sum(g.duration_minutes)::int
      FROM public.grooming_appointments g
      WHERE g.appointment_date = p_date
        AND g.station_id = s.id
        AND coalesce(g.status, '') <> 'cancelled'
        AND coalesce(g.no_show, false) = false
    ), 0),
    (
      (EXTRACT(EPOCH FROM (p_day_end - p_day_start)) / 60)::int
      - coalesce((
        SELECT sum(g.duration_minutes)
        FROM public.grooming_appointments g
        WHERE g.appointment_date = p_date
          AND g.station_id = s.id
          AND coalesce(g.status, '') <> 'cancelled'
          AND coalesce(g.no_show, false) = false
      ), 0)
    )::int
  FROM public.grooming_stations s
  WHERE coalesce(s.is_active, true)
  ORDER BY s.sort_order, s.name;
$$;

CREATE OR REPLACE FUNCTION public.woof_validate_grooming_appt(
  p_date date,
  p_station_id uuid,
  p_start time,
  p_duration int,
  p_day_start time DEFAULT '08:00',
  p_day_end time DEFAULT '18:00',
  p_appt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO public
AS $$
DECLARE
  w jsonb := '[]'::jsonb;
  v_end time;
  v_free int;
BEGIN
  SELECT c.free_minutes INTO v_free
  FROM public.woof_grooming_day_capacity(p_date, p_day_start, p_day_end) c
  LIMIT 1;

  IF coalesce(v_free, 0) < p_duration THEN
    w := w || jsonb_build_object(
      'code', 'over_budget',
      'msg', 'Not enough grooming time left today'
    );
  END IF;

  IF p_start IS NOT NULL THEN
    v_end := p_start + make_interval(mins => p_duration);
    IF p_start < p_day_start OR v_end > p_day_end THEN
      w := w || jsonb_build_object(
        'code', 'outside_hours',
        'msg', 'Falls outside grooming hours'
      );
    END IF;

    IF p_station_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.grooming_appointments g
      WHERE g.appointment_date = p_date
        AND g.station_id = p_station_id
        AND g.appointment_time IS NOT NULL
        AND (p_appt_id IS NULL OR g.id <> p_appt_id)
        AND coalesce(g.status, '') <> 'cancelled'
        AND coalesce(g.no_show, false) = false
        AND tsrange(p_date + p_start, p_date + v_end)
            && tsrange(
              p_date + g.appointment_time,
              p_date + g.appointment_time + make_interval(mins => g.duration_minutes)
            )
    ) THEN
      w := w || jsonb_build_object(
        'code', 'overlap',
        'msg', 'Overlaps another appointment at this station'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(w) = 0, 'warnings', w);
END;
$$;

GRANT SELECT ON public.woof_v_booking_required_class TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_dog_room_load(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_required_class(text[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_boarding_night_capacity(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_boarding_range_feasibility(date, date, public.room_size_class) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_suggest_boarding_room(date, date, public.room_size_class) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_validate_boarding_assignment(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_grooming_default_minutes(public.grooming_service, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_grooming_day_capacity(date, time, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_grooming_station_load(date, time, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_validate_grooming_appt(date, uuid, time, int, time, time, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.woof_backfill_room_size_class() TO service_role;

COMMIT;

-- Verification (paste in Supabase SQL editor):
-- SELECT typname FROM pg_type WHERE typname IN ('room_size_class', 'room_restriction_type');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'size_class';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'pets' AND column_name = 'room_restriction';
-- SELECT public.woof_dog_room_load('medium'), public.woof_required_class(ARRAY['medium','medium']), public.woof_required_class(ARRAY['small']);
-- SELECT * FROM public.woof_boarding_night_capacity(current_date);
-- SELECT * FROM public.woof_grooming_day_capacity(current_date);
-- SELECT size_class, count(*) FROM public.rooms WHERE size_class IS NOT NULL GROUP BY 1;
-- SELECT id, name, sort_order, is_active FROM public.grooming_stations ORDER BY sort_order, name;
