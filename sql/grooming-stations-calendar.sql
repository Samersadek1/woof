-- Grooming station calendar: stations, blocks, appointment station_id, override audit log
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.grooming_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grooming_stations_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS grooming_stations_sort_idx
  ON public.grooming_stations (sort_order, name);

ALTER TABLE public.grooming_appointments
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.grooming_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS grooming_appointments_station_date_idx
  ON public.grooming_appointments (appointment_date, station_id);

CREATE TABLE IF NOT EXISTS public.grooming_station_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.grooming_stations(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time,
  end_time time,
  is_full_day boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS grooming_station_blocks_station_date_idx
  ON public.grooming_station_blocks (block_date, station_id);

CREATE TABLE IF NOT EXISTS public.grooming_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.grooming_appointments(id) ON DELETE CASCADE,
  conflict_type text NOT NULL CHECK (conflict_type IN ('appointment_overlap', 'station_block_overlap')),
  conflicted_with_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS grooming_schedule_overrides_appt_idx
  ON public.grooming_schedule_overrides (appointment_id);

ALTER TABLE public.grooming_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grooming_station_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grooming_schedule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grooming_stations_all" ON public.grooming_stations;
CREATE POLICY "grooming_stations_all"
  ON public.grooming_stations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_station_blocks_all" ON public.grooming_station_blocks;
CREATE POLICY "grooming_station_blocks_all"
  ON public.grooming_station_blocks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_schedule_overrides_all" ON public.grooming_schedule_overrides;
CREATE POLICY "grooming_schedule_overrides_all"
  ON public.grooming_schedule_overrides FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.grooming_stations (name, sort_order, is_active)
SELECT v.name, v.sort_order, true
FROM (VALUES
  ('Station 1', 1),
  ('Station 2', 2),
  ('Station 3', 3),
  ('Station 4', 4)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_stations gs WHERE gs.name = v.name
);

COMMIT;

-- Verification (paste results back after run)
SELECT id, name, sort_order, is_active
FROM public.grooming_stations
ORDER BY sort_order;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'grooming_appointments'
  AND column_name = 'station_id';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('grooming_station_blocks', 'grooming_schedule_overrides')
ORDER BY table_name;
