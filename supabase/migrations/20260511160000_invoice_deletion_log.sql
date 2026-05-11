-- Audit trail when an invoice row is permanently removed from `public.invoices`.
-- Apply via: supabase db push / migrate, or paste into Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.invoice_deletion_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id text,
  owner_name text,
  total_amount numeric,
  deleted_at timestamptz DEFAULT now(),
  deleted_by text,
  reason text
);

COMMENT ON TABLE public.invoice_deletion_log IS 'Snapshot + reason when an invoice is deleted from the app (invoice_id holds display number e.g. INV-2026-00458).';
