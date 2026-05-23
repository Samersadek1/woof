CREATE TABLE IF NOT EXISTS public.invoice_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id text,
  invoice_row_id uuid,
  owner_name text,
  total_amount numeric,
  deleted_by text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_deletion_log_invoice_row_id_fkey'
  ) THEN
    ALTER TABLE public.invoice_deletion_log
      ADD CONSTRAINT invoice_deletion_log_invoice_row_id_fkey
      FOREIGN KEY (invoice_row_id)
      REFERENCES public.invoices (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.invoice_deletion_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_deletion_log'
      AND policyname = 'invoice_deletion_log_authenticated_select'
  ) THEN
    CREATE POLICY invoice_deletion_log_authenticated_select
      ON public.invoice_deletion_log
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;
