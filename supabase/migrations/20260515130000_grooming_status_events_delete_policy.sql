-- Allow authenticated clients to delete grooming status events before appointment removal.

DROP POLICY IF EXISTS "grooming_status_events_delete_authenticated" ON public.grooming_status_events;
CREATE POLICY "grooming_status_events_delete_authenticated"
  ON public.grooming_status_events
  FOR DELETE
  TO authenticated
  USING (true);
