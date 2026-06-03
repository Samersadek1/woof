-- Backfill invoice_payments from legacy invoices.amount_paid (2026-06-03).
--
-- Why: invoice_payments is empty (0 rows) while 351 non-voided invoices carry
-- amount_paid > 0. The AFTER INSERT trigger trg_update_invoice_status_on_payment
-- recomputes invoices.amount_paid = SUM(invoice_payments). Without a backfill,
-- the first new payment on any of these invoices would RESET amount_paid to only
-- the new payment, silently discarding the legacy paid amount (data loss).
--
-- This inserts exactly one synthetic payment row per qualifying invoice equal to
-- its current amount_paid, so SUM(invoice_payments) == amount_paid afterwards.
--
-- The status-recompute trigger is disabled during the insert so existing status
-- values (notably the legacy 'paid' terminal, used by lifetimeSpend and the
-- "Settled" filter) are preserved and NOT flipped to 'finalised'.
--
-- Scope: receipt_only = false, amount_paid > 0, status IN ('paid','partially_paid'),
-- and no existing invoice_payments rows. Voided invoices are intentionally excluded.
--
-- Rollback: see sql/invoice-payments-backfill-20260603-record.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_payments_backfill_20260603 (
  payment_id  uuid PRIMARY KEY,
  invoice_id  uuid NOT NULL,
  amount      numeric NOT NULL,
  old_status  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payments
  DISABLE TRIGGER trg_update_invoice_status_on_payment;

WITH inserted AS (
  INSERT INTO public.invoice_payments (
    invoice_id,
    owner_id,
    amount,
    payment_method,
    wallet_transaction_id,
    opening_balance,
    closing_balance,
    notes,
    recorded_by,
    created_at
  )
  SELECT
    i.id,
    i.owner_id,
    i.amount_paid,
    COALESCE(i.payment_method::text, 'card')::payment_method,
    NULL,
    COALESCE(i.opening_balance, 0),
    GREATEST(i.total - i.amount_paid, 0),
    'Backfilled from legacy amount_paid (2026-06-03)',
    'migration',
    COALESCE(i.paid_at, i.created_at)
  FROM public.invoices i
  WHERE COALESCE(i.receipt_only, false) = false
    AND i.amount_paid > 0
    AND i.status IN ('paid', 'partially_paid')
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id
    )
  RETURNING id AS payment_id, invoice_id, amount, created_at
)
INSERT INTO invoice_payments_backfill_20260603 (payment_id, invoice_id, amount, old_status, created_at)
SELECT
  ins.payment_id,
  ins.invoice_id,
  ins.amount,
  i.status::text,
  ins.created_at
FROM inserted ins
JOIN public.invoices i ON i.id = ins.invoice_id
ON CONFLICT (payment_id) DO NOTHING;

ALTER TABLE public.invoice_payments
  ENABLE TRIGGER trg_update_invoice_status_on_payment;

COMMIT;

-- Verification (expect backfilled_rows = 351, all_in_sync = 0 divergent)
SELECT
  (SELECT COUNT(*) FROM invoice_payments_backfill_20260603) AS backfilled_rows,
  (SELECT COUNT(*) FROM invoice_payments) AS total_payment_rows,
  (
    SELECT COUNT(*)
    FROM invoices i
    JOIN (
      SELECT invoice_id, SUM(amount) AS rows_sum
      FROM invoice_payments GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    WHERE ABS(i.amount_paid - p.rows_sum) > 0.01
  ) AS divergent_after;
