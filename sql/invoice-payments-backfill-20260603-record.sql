-- Record + rollback reference for the invoice_payments backfill (2026-06-03).
-- Applied via supabase/migrations/20260603130000_backfill_invoice_payments_from_amount_paid.sql
--
-- Each backfilled row is one synthetic invoice_payments row equal to the
-- invoice's legacy amount_paid, recorded_by = 'migration'.

-- 1. Inspect what was backfilled
SELECT
  b.invoice_id,
  i.invoice_number,
  b.old_status,
  i.status      AS current_status,
  i.total,
  b.amount      AS backfilled_amount,
  b.created_at
FROM invoice_payments_backfill_20260603 b
JOIN invoices i ON i.id = b.invoice_id
ORDER BY b.created_at DESC;

-- 2. Rollback (safe only before any NEW payments are added to these invoices).
--    Disable the trigger first so deleting synthetic rows does not cascade into
--    amount_paid recompute (the trigger is AFTER INSERT only, but disable anyway
--    in case it is later extended to UPDATE/DELETE).
--
-- BEGIN;
-- ALTER TABLE public.invoice_payments DISABLE TRIGGER trg_update_invoice_status_on_payment;
-- DELETE FROM public.invoice_payments
--   WHERE id IN (SELECT payment_id FROM invoice_payments_backfill_20260603);
-- ALTER TABLE public.invoice_payments ENABLE TRIGGER trg_update_invoice_status_on_payment;
-- DROP TABLE invoice_payments_backfill_20260603;
-- COMMIT;
