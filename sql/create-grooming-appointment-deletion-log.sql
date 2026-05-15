-- Creates grooming_appointment_deletion_log for tracking deleted cancelled appointments.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.grooming_appointment_deletion_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id text,
  appointment_date text,
  pet_name text,
  owner_name text,
  service text,
  price numeric,
  deleted_at timestamptz DEFAULT now(),
  deleted_by text,
  reason text
);

ALTER TABLE public.grooming_appointment_deletion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grooming_appointment_deletion_log_insert" ON public.grooming_appointment_deletion_log;
CREATE POLICY "grooming_appointment_deletion_log_insert"
  ON public.grooming_appointment_deletion_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "grooming_appointment_deletion_log_select" ON public.grooming_appointment_deletion_log;
CREATE POLICY "grooming_appointment_deletion_log_select"
  ON public.grooming_appointment_deletion_log
  FOR SELECT
  TO authenticated
  USING (true);
