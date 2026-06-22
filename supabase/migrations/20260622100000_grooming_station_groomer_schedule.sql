-- Weekly station-to-groomer template for day-board display and booking pre-fill.

CREATE TABLE IF NOT EXISTS public.grooming_station_weekly_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.grooming_stations(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  groomer_id uuid NOT NULL REFERENCES public.grooming_groomers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grooming_station_weekly_assignments_station_dow_unique
    UNIQUE (station_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS grooming_station_weekly_assignments_station_idx
  ON public.grooming_station_weekly_assignments (station_id);

ALTER TABLE public.grooming_station_weekly_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grooming_station_weekly_assignments_all" ON public.grooming_station_weekly_assignments;
CREATE POLICY "grooming_station_weekly_assignments_all"
  ON public.grooming_station_weekly_assignments FOR ALL USING (true) WITH CHECK (true);

-- Verification:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'grooming_station_weekly_assignments';
-- SELECT w.station_id, s.name AS station_name, w.day_of_week, g.name AS groomer_name
--   FROM public.grooming_station_weekly_assignments w
--   JOIN public.grooming_stations s ON s.id = w.station_id
--   JOIN public.grooming_groomers g ON g.id = w.groomer_id
--   ORDER BY s.sort_order, w.day_of_week;
