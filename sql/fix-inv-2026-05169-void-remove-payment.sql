-- INV-2026-05169 (Sherine Jafar) — voided "WRONG INVOICE" but card payment left in place.
-- Remove payment + card ledger row; keep invoice voided with amount_paid = 0.
-- Card payment did not touch wallet_balance — no wallet credit needed.
-- Idempotent: no-ops when payment rows are already gone.
--
-- Samer: paste into Supabase SQL editor.

BEGIN;

DELETE FROM invoice_payments
WHERE id = '107aa188-cf30-4b02-a6ae-5b89ba81f0a8'
  AND invoice_id = 'fdd10cc8-44a8-49a0-bbd0-8569134d7ff3'
  AND amount = 330.75
  AND payment_method = 'card';

DELETE FROM wallet_transactions
WHERE id = '57a9385f-c35f-47ad-a024-e496c2704c0a'
  AND invoice_id = 'fdd10cc8-44a8-49a0-bbd0-8569134d7ff3'
  AND transaction_type = 'card_payment'
  AND amount = 330.75;

-- Trigger only fires on INSERT; clear paid fields manually. Stay voided.
UPDATE invoices
SET
  amount_paid = 0,
  paid_at = NULL,
  payment_method = NULL,
  notes = NULLIF(
    TRIM(BOTH E'\n' FROM REGEXP_REPLACE(COALESCE(notes, ''), E'Refund note:[^\n]*\n?', '', 'g')),
    ''
  ),
  updated_at = now()
WHERE id = 'fdd10cc8-44a8-49a0-bbd0-8569134d7ff3'
  AND invoice_number = 'INV-2026-05169'
  AND status = 'voided'
  AND amount_paid = 330.75;

COMMIT;

-- Verification
SELECT
  i.invoice_number,
  i.status,
  i.total,
  i.amount_paid,
  i.payment_method,
  i.paid_at,
  i.voided_at,
  i.voided_reason,
  i.notes,
  o.first_name,
  o.last_name,
  o.wallet_balance
FROM invoices i
JOIN owners o ON o.id = i.owner_id
WHERE i.invoice_number = 'INV-2026-05169';

SELECT id, amount, payment_method, created_at
FROM invoice_payments
WHERE invoice_id = 'fdd10cc8-44a8-49a0-bbd0-8569134d7ff3';

SELECT id, transaction_type, amount, payment_method, notes, created_at
FROM wallet_transactions
WHERE invoice_id = 'fdd10cc8-44a8-49a0-bbd0-8569134d7ff3';
