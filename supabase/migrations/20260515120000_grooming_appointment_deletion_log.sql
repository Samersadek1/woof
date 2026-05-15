-- Audit trail when a cancelled grooming appointment is permanently removed.
-- Apply via: supabase db push / migrate, or paste into Dashboard → SQL Editor.

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

COMMENT ON TABLE public.grooming_appointment_deletion_log IS 'Snapshot + reason when a cancelled grooming appointment is deleted from the app.';

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
