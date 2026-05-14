-- Creates the daycare_package_deletion_log table for tracking deleted packages.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.daycare_package_deletion_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id text,
  owner_name text,
  pet_name text,
  total_days integer,
  days_used integer,
  price_paid numeric,
  deleted_at timestamptz DEFAULT now(),
  deleted_by text,
  reason text
);

-- Allow authenticated users to insert logs
ALTER TABLE public.daycare_package_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert deletion logs"
  ON public.daycare_package_deletion_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read deletion logs"
  ON public.daycare_package_deletion_log
  FOR SELECT
  TO authenticated
  USING (true);
