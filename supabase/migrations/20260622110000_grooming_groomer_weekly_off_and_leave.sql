-- Recurring weekly groomer days off + leave periods (date ranges).

DROP TABLE IF EXISTS public.grooming_groomer_days_off;

CREATE TABLE IF NOT EXISTS public.grooming_groomer_weekly_days_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id uuid NOT NULL REFERENCES public.grooming_groomers(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grooming_groomer_weekly_days_off_unique
    UNIQUE (groomer_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS grooming_groomer_weekly_days_off_groomer_idx
  ON public.grooming_groomer_weekly_days_off (groomer_id);

CREATE TABLE IF NOT EXISTS public.grooming_groomer_leave_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id uuid NOT NULL REFERENCES public.grooming_groomers(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grooming_groomer_leave_periods_dates_check
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS grooming_groomer_leave_periods_groomer_idx
  ON public.grooming_groomer_leave_periods (groomer_id);

CREATE INDEX IF NOT EXISTS grooming_groomer_leave_periods_range_idx
  ON public.grooming_groomer_leave_periods (start_date, end_date);

ALTER TABLE public.grooming_groomer_weekly_days_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grooming_groomer_leave_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grooming_groomer_weekly_days_off_all" ON public.grooming_groomer_weekly_days_off;
CREATE POLICY "grooming_groomer_weekly_days_off_all"
  ON public.grooming_groomer_weekly_days_off FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_groomer_leave_periods_all" ON public.grooming_groomer_leave_periods;
CREATE POLICY "grooming_groomer_leave_periods_all"
  ON public.grooming_groomer_leave_periods FOR ALL USING (true) WITH CHECK (true);

-- Verification:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('grooming_groomer_weekly_days_off', 'grooming_groomer_leave_periods')
--   ORDER BY 1;
-- SELECT g.name, w.day_of_week
--   FROM public.grooming_groomer_weekly_days_off w
--   JOIN public.grooming_groomers g ON g.id = w.groomer_id
--   ORDER BY g.name, w.day_of_week;
-- SELECT g.name, p.start_date, p.end_date, p.note
--   FROM public.grooming_groomer_leave_periods p
--   JOIN public.grooming_groomers g ON g.id = p.groomer_id
--   ORDER BY p.start_date;
