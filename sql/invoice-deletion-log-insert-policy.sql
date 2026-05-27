-- Allow staff (authenticated) to write invoice deletion audit rows.
-- Run in Supabase SQL editor if delete invoice fails after the invoice row is removed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_deletion_log'
      AND policyname = 'invoice_deletion_log_authenticated_insert'
  ) THEN
    CREATE POLICY invoice_deletion_log_authenticated_insert
      ON public.invoice_deletion_log
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END
$$;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'invoice_deletion_log'
ORDER BY policyname;
