-- Emma Procter — INV-2026-02949 (Lucky 7 - Poppy, AED 588)
-- Staff recorded 3 payments (card + 2× bank transfer); Emma paid one bank transfer only.
-- Keep: bank_transfer 588 @ 2026-06-05 14:28:24 (payment f1366ee4…, wallet tx cb12126d…)
--
-- Run in Supabase SQL editor. Samer runs SQL.
-- Idempotent: skips when one bank_transfer row remains and amount_paid = 588.

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_payments_fix_emma_procter_20260606 (
  payment_id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions_fix_emma_procter_20260606 (
  transaction_id uuid PRIMARY KEY,
  invoice_id uuid,
  transaction_type text NOT NULL,
  amount numeric NOT NULL,
  payment_method text,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_invoice_id uuid := '36ec2ba0-f0db-4db8-b415-3f8f48207b50';
  v_keep_payment_id uuid := 'f1366ee4-1c6c-4cf6-9497-b0f6d33494b1';
  v_payment_count int;
  v_payments_sum numeric;
  v_amount_paid numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = v_invoice_id AND invoice_number = 'INV-2026-02949'
  ) THEN
    RAISE EXCEPTION 'Invoice INV-2026-02949 not found.';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_payment_count, v_payments_sum
  FROM invoice_payments
  WHERE invoice_id = v_invoice_id;

  SELECT amount_paid INTO v_amount_paid
  FROM invoices WHERE id = v_invoice_id;

  IF v_payment_count = 1
     AND EXISTS (
       SELECT 1 FROM invoice_payments
       WHERE id = v_keep_payment_id
         AND invoice_id = v_invoice_id
         AND payment_method = 'bank_transfer'
         AND amount = 588
     )
     AND v_amount_paid = 588
  THEN
    RAISE NOTICE 'Already corrected — one bank_transfer payment of 588 remains.';
    RETURN;
  END IF;

  IF v_payment_count <> 3 OR v_payments_sum <> 1764 THEN
    RAISE EXCEPTION
      'Unexpected state: expected 3 payment rows totalling 1764, found % rows totalling %.',
      v_payment_count, v_payments_sum;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM invoice_payments
    WHERE id = v_keep_payment_id AND invoice_id = v_invoice_id
  ) THEN
    RAISE EXCEPTION 'Keep payment row % not found on invoice.', v_keep_payment_id;
  END IF;

  -- Archive rows before delete (rollback reference).
  INSERT INTO invoice_payments_fix_emma_procter_20260606 (
    payment_id, invoice_id, amount, payment_method, created_at
  )
  SELECT ip.id, ip.invoice_id, ip.amount, ip.payment_method::text, ip.created_at
  FROM invoice_payments ip
  WHERE ip.invoice_id = v_invoice_id
    AND ip.id <> v_keep_payment_id
  ON CONFLICT (payment_id) DO NOTHING;

  INSERT INTO wallet_transactions_fix_emma_procter_20260606 (
    transaction_id, invoice_id, transaction_type, amount, payment_method, created_at
  )
  SELECT wt.id, wt.invoice_id, wt.transaction_type, wt.amount, wt.payment_method, wt.created_at
  FROM wallet_transactions wt
  WHERE wt.id IN (
    '927ea8a1-7f04-4141-b81b-5ccdb041391c', -- card
    '091a98c9-7041-40a0-97ce-4ea4b54e6f15'  -- duplicate bank transfer
  )
  ON CONFLICT (transaction_id) DO NOTHING;

  DELETE FROM invoice_payments
  WHERE invoice_id = v_invoice_id
    AND id IN (
      'c6ce8e10-49f3-419a-85ff-3cc66b418377', -- card (wrong method)
      '2d25fad0-a9a7-40aa-b681-1adefa956352'  -- duplicate bank transfer
    );

  DELETE FROM wallet_transactions
  WHERE id IN (
    '927ea8a1-7f04-4141-b81b-5ccdb041391c',
    '091a98c9-7041-40a0-97ce-4ea4b54e6f15'
  );

  -- Trigger only fires on INSERT; reconcile invoice manually.
  UPDATE invoices
  SET
    amount_paid = 588.00,
    status = 'paid'::invoice_status,
    payment_method = 'bank_transfer',
    paid_at = '2026-06-05 14:28:24.852055+00',
    updated_at = now()
  WHERE id = v_invoice_id
    AND invoice_number = 'INV-2026-02949';
END $$;

COMMIT;

-- Verification (paste after COMMIT):
SELECT
  i.invoice_number,
  i.status,
  i.total,
  i.amount_paid,
  i.payment_method,
  i.paid_at,
  (SELECT COUNT(*) FROM invoice_payments ip WHERE ip.invoice_id = i.id) AS payment_rows,
  (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments ip WHERE ip.invoice_id = i.id) AS payments_sum
FROM invoices i
WHERE i.invoice_number = 'INV-2026-02949';

SELECT ip.id, ip.amount, ip.payment_method, ip.recorded_by, ip.created_at
FROM invoice_payments ip
JOIN invoices i ON i.id = ip.invoice_id
WHERE i.invoice_number = 'INV-2026-02949';

SELECT wt.id, wt.transaction_type, wt.amount, wt.payment_method, wt.created_at
FROM wallet_transactions wt
JOIN invoices i ON i.id = wt.invoice_id
WHERE i.invoice_number = 'INV-2026-02949'
ORDER BY wt.created_at;
