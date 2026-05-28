-- Calendar-year peak periods for boarding (replaces month/day-only logic for active rows).

BEGIN;

ALTER TABLE public.peak_periods
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

COMMENT ON COLUMN public.peak_periods.start_date IS
  'Inclusive peak range start (calendar date). Preferred over start_month/start_day when set.';
COMMENT ON COLUMN public.peak_periods.end_date IS
  'Inclusive peak range end (calendar date). Preferred over end_month/end_day when set.';

-- Deactivate legacy month/day-only rows and seed 2026 operational calendar.
UPDATE public.peak_periods SET is_active = false WHERE is_active;

INSERT INTO public.peak_periods (
  label, start_month, start_day, end_month, end_day,
  start_date, end_date, notes, is_active
) VALUES
  ('May Peak', 5, 19, 5, 29, '2026-05-19', '2026-05-29', '2026: May 19–29', true),
  ('June Peak', 6, 15, 6, 16, '2026-06-15', '2026-06-16', '2026: June 15–16', true),
  ('Summer Peak', 7, 1, 8, 31, '2026-07-01', '2026-08-31', '2026: July 1–August 31', true),
  ('Late November Peak', 11, 30, 12, 2, '2026-11-30', '2026-12-02', '2026: Nov 30–Dec 2', true),
  ('Christmas/NY Peak', 12, 20, 1, 8, '2026-12-20', '2027-01-08', '2026–2027: Dec 20–Jan 8', true);

CREATE OR REPLACE FUNCTION public.is_peak_date(p_date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  pp record;
  d_month int := EXTRACT(MONTH FROM p_date)::int;
  d_day   int := EXTRACT(DAY FROM p_date)::int;
BEGIN
  FOR pp IN
    SELECT start_date, end_date, start_month, start_day, end_month, end_day
    FROM public.peak_periods
    WHERE is_active
  LOOP
    IF pp.start_date IS NOT NULL AND pp.end_date IS NOT NULL THEN
      IF p_date >= pp.start_date AND p_date <= pp.end_date THEN
        RETURN true;
      END IF;
      CONTINUE;
    END IF;

    IF pp.start_month <= pp.end_month THEN
      IF (d_month > pp.start_month
          OR (d_month = pp.start_month AND d_day >= pp.start_day))
        AND (d_month < pp.end_month
          OR (d_month = pp.end_month AND d_day <= pp.end_day))
      THEN
        RETURN true;
      END IF;
    ELSE
      IF (d_month > pp.start_month
          OR (d_month = pp.start_month AND d_day >= pp.start_day))
        OR (d_month < pp.end_month
          OR (d_month = pp.end_month AND d_day <= pp.end_day))
      THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_peak_period(
  p_id uuid DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
  v_label text;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'upsert_peak_period requires authenticated user';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  v_label := nullif(trim(p_label), '');
  IF v_label IS NULL THEN
    v_label := to_char(p_start_date, 'Mon DD, YYYY') || ' – ' || to_char(p_end_date, 'Mon DD, YYYY');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.peak_periods
    SET
      label = v_label,
      start_date = p_start_date,
      end_date = p_end_date,
      start_month = EXTRACT(MONTH FROM p_start_date)::int,
      start_day = EXTRACT(DAY FROM p_start_date)::int,
      end_month = EXTRACT(MONTH FROM p_end_date)::int,
      end_day = EXTRACT(DAY FROM p_end_date)::int,
      notes = nullif(trim(p_notes), ''),
      is_active = true
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Peak period % not found', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.peak_periods (
    label,
    start_date,
    end_date,
    start_month,
    start_day,
    end_month,
    end_day,
    notes,
    is_active
  ) VALUES (
    v_label,
    p_start_date,
    p_end_date,
    EXTRACT(MONTH FROM p_start_date)::int,
    EXTRACT(DAY FROM p_start_date)::int,
    EXTRACT(MONTH FROM p_end_date)::int,
    EXTRACT(DAY FROM p_end_date)::int,
    nullif(trim(p_notes), ''),
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_peak_period(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'deactivate_peak_period requires authenticated user';
  END IF;

  UPDATE public.peak_periods
  SET is_active = false
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peak period % not found', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_peak_period(uuid, text, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_peak_period(uuid) TO authenticated, service_role;

COMMIT;

-- Verification (paste after COMMIT)
-- SELECT label, start_date, end_date, is_active FROM peak_periods WHERE is_active ORDER BY start_date;
-- SELECT is_peak_date('2026-05-18') AS may18_off, is_peak_date('2026-05-19') AS may19_peak;
