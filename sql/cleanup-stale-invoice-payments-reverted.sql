-- Cleanup: stale invoice_payments rows left behind by past reverts / voids.
--
-- Symptom: the invoice recognises NO payment (invoices.amount_paid = 0) but
-- invoice_payments rows linger, so the ledger/detail still show "payments" that
-- were actually reverted. The customer print already reconciles around this; this
-- script makes the ledger match too, and is the historical counterpart to the
-- code fix in src/lib/revertInvoicePayment.ts (which now archives + removes these
-- rows at revert time).
--
-- Affected invoices (snapshot 2026-06-06):
--   INV-2026-02864  (voided)       1 row,  63.00
--   INV-2026-02869  (outstanding)  1 row,  36.75
--   INV-2026-02976  (voided)       1 row,  42.00
--   INV-2026-03033  (outstanding)  2 rows, 535.50  (paid 2x, reverted)
--
-- wallet_transactions are NOT touched — full financial history is retained there.
-- Idempotent: once the rows are archived + removed, re-running is a no-op.
--
-- Run in the Supabase SQL editor. Samer runs SQL.

BEGIN;

-- Permanent archive of anything removed (rollback / audit reference).
CREATE TABLE IF NOT EXISTS invoice_payments_reverted_archive (
  payment_id      uuid PRIMARY KEY,
  invoice_id      uuid NOT NULL,
  owner_id        uuid,
  amount          numeric NOT NULL,
  payment_method  text,
  recorded_by     text,
  created_at      timestamptz,
  archived_at     timestamptz NOT NULL DEFAULT now(),
  archived_reason text NOT NULL DEFAULT 'stale invoice_payments on reverted/voided invoice (amount_paid = 0)'
);

-- Archive every stale row: invoice recognises no payment but rows remain.
INSERT INTO invoice_payments_reverted_archive (
  payment_id, invoice_id, owner_id, amount, payment_method, recorded_by, created_at
)
SELECT ip.id, ip.invoice_id, ip.owner_id, ip.amount, ip.payment_method::text, ip.recorded_by, ip.created_at
FROM invoice_payments ip
JOIN invoices i ON i.id = ip.invoice_id
WHERE round(i.amount_paid, 2) = 0
ON CONFLICT (payment_id) DO NOTHING;

-- Remove them so the ledger total matches invoices.amount_paid.
DELETE FROM invoice_payments ip
USING invoices i
WHERE ip.invoice_id = i.id
  AND round(i.amount_paid, 2) = 0;

COMMIT;

-- ── Verification (run after COMMIT; expect 0 rows) ───────────────────────────
-- Any invoice whose invoice_payments sum still disagrees with amount_paid.
SELECT i.invoice_number,
       i.status,
       i.amount_paid,
       count(ip.id)                 AS remaining_rows,
       coalesce(sum(ip.amount), 0)  AS ip_sum
FROM invoices i
JOIN invoice_payments ip ON ip.invoice_id = i.id
GROUP BY i.invoice_number, i.status, i.amount_paid
HAVING round(coalesce(sum(ip.amount), 0), 2) <> round(i.amount_paid, 2)
ORDER BY i.invoice_number;
