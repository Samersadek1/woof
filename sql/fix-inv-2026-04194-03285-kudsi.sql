-- Fix INV-2026-04194: remove mistaken INV-2026-03285 consolidation (Yusuf Kudsi).
--
-- 03285 was partially paid via wallet (AED 446.25) before consolidation. Its lines
-- (AED 477.75) were copied onto 04194, leaving AED 446.25 balance due on 04194
-- that belongs on 03285 instead. Remove 03285 from 04194 and restore both invoices.
--
-- After fix:
--   INV-2026-03285 → partially_paid (AED 446.25 paid, AED 31.50 due)
--   INV-2026-04194 → paid (AED 672 bank transfer on AED 640.50 total; AED 31.50 overpay)

BEGIN;

-- 1. Reverse cancellation refund on INV-2026-04194 (AED 672 credited to wallet on void)
UPDATE owners
SET wallet_balance = ROUND(wallet_balance - 672.00, 2)
WHERE id = '93e28db3-e242-408a-b20b-aa460e06b335'
  AND EXISTS (
    SELECT 1 FROM wallet_transactions wt
    WHERE wt.id = '611e5c14-b651-4664-9e84-874c407fd277'
      AND wt.transaction_type = 'refund'
      AND wt.amount = 672.00
  )
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions wt
    WHERE wt.notes LIKE '%FIX:INV-2026-04194-03285%'
      AND wt.transaction_type = 'deduction'
      AND wt.amount = -672.00
  );

INSERT INTO wallet_transactions (
  owner_id,
  transaction_type,
  amount,
  balance_after,
  invoice_id,
  reference_type,
  reference_id,
  payment_method,
  performed_by,
  notes
)
SELECT
  '93e28db3-e242-408a-b20b-aa460e06b335',
  'deduction',
  -672.00,
  o.wallet_balance,
  'a782f7cd-d2f1-4c45-abbb-d891e2718d87',
  'invoice',
  'a782f7cd-d2f1-4c45-abbb-d891e2718d87',
  'wallet',
  'system',
  'Reversal of cancellation refund — invoice restored after removing INV-03285. FIX:INV-2026-04194-03285'
FROM owners o
WHERE o.id = '93e28db3-e242-408a-b20b-aa460e06b335'
  AND EXISTS (
    SELECT 1 FROM wallet_transactions wt
    WHERE wt.id = '611e5c14-b651-4664-9e84-874c407fd277'
      AND wt.transaction_type = 'refund'
      AND wt.amount = 672.00
  )
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions wt
    WHERE wt.notes LIKE '%FIX:INV-2026-04194-03285%'
      AND wt.transaction_type = 'deduction'
      AND wt.amount = -672.00
  );

-- 2. Remove INV-2026-03285 line items mistakenly copied onto consolidated invoice
DELETE FROM invoice_line_items
WHERE invoice_id = 'a782f7cd-d2f1-4c45-abbb-d891e2718d87'
  AND description LIKE 'INV-2026-03285:%';

-- 3. Recalculate INV-2026-04194 totals (was 1118.25 incl. 03285; now 640.50)
UPDATE invoices
SET
  subtotal = 640.50,
  total = 640.50,
  vat_aed = 30.50,
  amount_paid = 672.00,
  status = 'paid',
  payment_method = 'bank_transfer',
  paid_at = COALESCE(paid_at, '2026-06-27 10:32:54.069882+00'),
  voided_at = NULL,
  voided_by = NULL,
  voided_reason = NULL,
  notes = TRIM(BOTH E'\n' FROM CONCAT(
    COALESCE(notes, ''),
    CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END,
    'FIX: removed mistaken INV-2026-03285 consolidation (AED 477.75 lines / AED 446.25 wallet credit).'
  )),
  updated_at = now()
WHERE id = 'a782f7cd-d2f1-4c45-abbb-d891e2718d87'
  AND invoice_number = 'INV-2026-04194';

-- 4. Restore INV-2026-03285 as its own open invoice
UPDATE invoices
SET
  status = 'partially_paid',
  voided_at = NULL,
  voided_by = NULL,
  voided_reason = NULL,
  notes = TRIM(BOTH E'\n' FROM CONCAT(
    COALESCE(notes, ''),
    CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END,
    'FIX: restored after mistaken consolidation into INV-2026-04194.'
  )),
  updated_at = now()
WHERE id = 'ad924091-6d27-4c3c-a156-2e4765432f5a'
  AND invoice_number = 'INV-2026-03285'
  AND status = 'voided';

COMMIT;

-- Verification
SELECT
  i.invoice_number,
  i.status,
  i.subtotal,
  i.total,
  i.amount_paid,
  ROUND(i.total - COALESCE(i.amount_paid, 0), 2) AS balance_due,
  i.vat_aed,
  i.voided_at,
  i.voided_reason
FROM invoices i
WHERE i.invoice_number IN ('INV-2026-03285', 'INV-2026-04194')
ORDER BY i.invoice_number;

SELECT ROUND(SUM(line_total), 2) AS line_sum_04194
FROM invoice_line_items
WHERE invoice_id = 'a782f7cd-d2f1-4c45-abbb-d891e2718d87';

SELECT COUNT(*) AS remaining_03285_lines_on_04194
FROM invoice_line_items
WHERE invoice_id = 'a782f7cd-d2f1-4c45-abbb-d891e2718d87'
  AND description LIKE 'INV-2026-03285:%';

SELECT o.wallet_balance
FROM owners o
WHERE o.id = '93e28db3-e242-408a-b20b-aa460e06b335';

SELECT id, amount, payment_method, created_at
FROM invoice_payments
WHERE invoice_id IN (
  'ad924091-6d27-4c3c-a156-2e4765432f5a',
  'a782f7cd-d2f1-4c45-abbb-d891e2718d87'
)
ORDER BY created_at;
