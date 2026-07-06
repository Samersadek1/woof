-- Fix INV-2026-04647 (Chadi/Lina Obeid): card payment recorded at pre-discount
-- subtotal (AED 78.75) instead of invoice total after discount (AED 73.50).

BEGIN;

UPDATE invoice_payments
SET
  amount = 73.50,
  closing_balance = -73.50
WHERE id = '99372ea9-77d8-4d44-8399-821dfcf7585a'
  AND invoice_id = '2423095c-f2cd-4f52-b559-78b51f80884e'
  AND amount = 78.75;

UPDATE wallet_transactions
SET amount = 73.50
WHERE id = '413e14b9-6a4f-4f98-a19e-8797bf77b38f'
  AND invoice_id = '2423095c-f2cd-4f52-b559-78b51f80884e'
  AND transaction_type = 'card_payment'
  AND amount = 78.75;

-- Trigger only fires on INSERT; update invoice manually.
UPDATE invoices
SET
  amount_paid = 73.50,
  updated_at = now()
WHERE id = '2423095c-f2cd-4f52-b559-78b51f80884e'
  AND invoice_number = 'INV-2026-04647'
  AND total = 73.50
  AND amount_paid = 78.75;

COMMIT;

-- Verification
SELECT
  i.invoice_number,
  i.status,
  i.subtotal,
  i.discount_amount,
  i.total,
  i.amount_paid,
  i.payment_method,
  o.first_name,
  o.last_name
FROM invoices i
JOIN owners o ON o.id = i.owner_id
WHERE i.invoice_number = 'INV-2026-04647';

SELECT id, amount, payment_method, opening_balance, closing_balance, recorded_by, created_at
FROM invoice_payments
WHERE invoice_id = '2423095c-f2cd-4f52-b559-78b51f80884e';

SELECT id, transaction_type, amount, payment_method, notes, created_at
FROM wallet_transactions
WHERE invoice_id = '2423095c-f2cd-4f52-b559-78b51f80884e';
