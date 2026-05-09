-- Grooming workflow: status values, audit log, and timestamps
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).

ALTER TABLE grooming_appointments
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS grooming_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES grooming_appointments(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grooming_status_events_appt_idx
  ON grooming_status_events(appointment_id);

CREATE INDEX IF NOT EXISTS grooming_status_events_created_idx
  ON grooming_status_events(created_at DESC);

ALTER TABLE grooming_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grooming_status_events_all" ON grooming_status_events;
CREATE POLICY "grooming_status_events_all"
  ON grooming_status_events FOR ALL USING (true) WITH CHECK (true);

-- Migrate legacy scheduled → new
UPDATE grooming_appointments SET status = 'new' WHERE status = 'scheduled';
