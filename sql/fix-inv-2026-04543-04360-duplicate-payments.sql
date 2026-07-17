-- Remove duplicate card payments on INV-2026-04543 and INV-2026-04360.
--
-- Each invoice was double-clicked / double-recorded ~140ms apart:
--   INV-2026-04543 (Catherine/Paul Firth): 2× AED 382.50 → amount_paid 765 (should be 382.50)
--   INV-2026-04360 (Raissa Garrido Belo):  2× AED 255.00 → amount_paid 510 (should be 255.00)
--
-- INV-2026-04523 (Cristina Boeddinghaus) already has a single AED 105 payment — no change.
--
-- Keep the earlier payment + card_payment ledger row; delete the later duplicate.
-- Trigger only fires on INSERT, so amount_paid is updated manually.
-- Idempotent: no-ops when the duplicate rows are already gone.
--
-- Samer: paste into Supabase SQL editor.

BEGIN;

-- ── INV-2026-04543 ──────────────────────────────────────────────────────────

DELETE FROM invoice_payments
WHERE id = '77fdede7-8f15-4fb2-9b8e-472af83f4d19'  -- later duplicate
  AND invoice_id = 'd05d8f1d-3097-481f-b080-b195867f5b07'
  AND amount = 382.50
  AND payment_method = 'card'
  AND EXISTS (
    SELECT 1 FROM invoice_payments
    WHERE id = '02303771-c842-4cdc-9098-88622bc81cf9'  -- keep earlier
      AND invoice_id = 'd05d8f1d-3097-481f-b080-b195867f5b07'
      AND amount = 382.50
  );

DELETE FROM wallet_transactions
WHERE id = '6040af5b-4e5a-4bab-b710-af16fa07e4bb'  -- later duplicate
  AND invoice_id = 'd05d8f1d-3097-481f-b080-b195867f5b07'
  AND transaction_type = 'card_payment'
  AND amount = 382.50
  AND EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE id = 'a6b2c914-6bf2-4b4d-a7e5-3ef41f9773b2'  -- keep earlier
      AND invoice_id = 'd05d8f1d-3097-481f-b080-b195867f5b07'
      AND amount = 382.50
  );

UPDATE invoices
SET
  amount_paid = 382.50,
  paid_at = '2026-07-07 11:06:06.952514+00',
  updated_at = now()
WHERE id = 'd05d8f1d-3097-481f-b080-b195867f5b07'
  AND invoice_number = 'INV-2026-04543'
  AND total = 382.50
  AND amount_paid = 765.00;

-- ── INV-2026-04360 ──────────────────────────────────────────────────────────

DELETE FROM invoice_payments
WHERE id = '7cae59f3-e77e-476b-8ccc-937da616298e'  -- later duplicate
  AND invoice_id = '5927d724-7861-4ebb-8b0e-466640b7080c'
  AND amount = 255.00
  AND payment_method = 'card'
  AND EXISTS (
    SELECT 1 FROM invoice_payments
    WHERE id = '1be84d1e-b4e2-4240-809e-4647cb3429ca'  -- keep earlier
      AND invoice_id = '5927d724-7861-4ebb-8b0e-466640b7080c'
      AND amount = 255.00
  );

DELETE FROM wallet_transactions
WHERE id = '87ee3f1b-28a7-4a76-9d10-983be4d5eb5e'  -- later duplicate
  AND invoice_id = '5927d724-7861-4ebb-8b0e-466640b7080c'
  AND transaction_type = 'card_payment'
  AND amount = 255.00
  AND EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE id = '027f77a1-2246-4e56-917c-16ff9963e8a7'  -- keep earlier
      AND invoice_id = '5927d724-7861-4ebb-8b0e-466640b7080c'
      AND amount = 255.00
  );

UPDATE invoices
SET
  amount_paid = 255.00,
  paid_at = '2026-07-08 07:18:47.371389+00',
  updated_at = now()
WHERE id = '5927d724-7861-4ebb-8b0e-466640b7080c'
  AND invoice_number = 'INV-2026-04360'
  AND total = 255.00
  AND amount_paid = 510.00;

COMMIT;

-- Verification (expect: one payment each; amount_paid = total)
SELECT
  i.invoice_number,
  i.status,
  i.total,
  i.amount_paid,
  i.payment_method,
  i.paid_at,
  o.first_name,
  o.last_name,
  (SELECT count(*) FROM invoice_payments ip WHERE ip.invoice_id = i.id) AS payment_count,
  (SELECT coalesce(sum(ip.amount), 0) FROM invoice_payments ip WHERE ip.invoice_id = i.id) AS payments_sum
FROM invoices i
JOIN owners o ON o.id = i.owner_id
WHERE i.invoice_number IN ('INV-2026-04543', 'INV-2026-04360', 'INV-2026-04523')
ORDER BY i.invoice_number;

SELECT i.invoice_number, ip.id, ip.amount, ip.payment_method, ip.created_at
FROM invoice_payments ip
JOIN invoices i ON i.id = ip.invoice_id
WHERE i.invoice_number IN ('INV-2026-04543', 'INV-2026-04360', 'INV-2026-04523')
ORDER BY i.invoice_number, ip.created_at;

SELECT i.invoice_number, wt.id, wt.transaction_type, wt.amount, wt.created_at
FROM wallet_transactions wt
JOIN invoices i ON i.id = wt.invoice_id
WHERE i.invoice_number IN ('INV-2026-04543', 'INV-2026-04360', 'INV-2026-04523')
ORDER BY i.invoice_number, wt.created_at;
