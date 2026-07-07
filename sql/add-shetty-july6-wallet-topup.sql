-- Restore Seema Shetty's AED 500 payment-link wallet top-up on 6 Jul 2026.
-- Samer: paste this into the Supabase SQL editor.

DO $$
DECLARE
  v_owner_id uuid := 'f513fed0-8ebb-44a9-96e3-2384269d53f8';
  v_created_at timestamptz := '2026-07-06 14:20:00+00';
  v_balance_before numeric;
BEGIN
  SELECT COALESCE(wt.balance_after, 0)
  INTO v_balance_before
  FROM public.wallet_transactions wt
  WHERE wt.owner_id = v_owner_id
    AND wt.created_at < v_created_at
  ORDER BY wt.created_at DESC, wt.id DESC
  LIMIT 1;

  v_balance_before := COALESCE(v_balance_before, 0);

  IF NOT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.owner_id = v_owner_id
      AND wt.created_at::date = DATE '2026-07-06'
      AND wt.transaction_type = 'manual_topup'::public.transaction_type
      AND wt.amount = 500
      AND wt.notes = 'Payment link top-up restored per 7 Jul SOA correction'
  ) THEN
    INSERT INTO public.wallet_transactions (
      owner_id,
      transaction_type,
      amount,
      balance_after,
      payment_method,
      reference_type,
      notes,
      created_at,
      performed_by
    )
    VALUES (
      v_owner_id,
      'manual_topup'::public.transaction_type,
      500,
      ROUND(v_balance_before + 500, 2),
      'payment_link'::public.payment_method,
      'payment_link',
      'Payment link top-up restored per 7 Jul SOA correction',
      v_created_at,
      'Woof Info'
    );
  END IF;
END $$;

-- Verification: confirms the July 6 top-up exists and the visible SOA ledger includes it.
SELECT id, created_at, transaction_type, amount, balance_after, payment_method, notes
FROM public.wallet_transactions
WHERE owner_id = 'f513fed0-8ebb-44a9-96e3-2384269d53f8'::uuid
  AND created_at::date = DATE '2026-07-06'
ORDER BY created_at, id;

SELECT row_id, created_at::date, amount, balance_after, transaction_type, invoice_number, notes
FROM public.get_ledger_statement(
  'f513fed0-8ebb-44a9-96e3-2384269d53f8'::uuid,
  '2025-01-01 00:00:00+04'::timestamptz,
  now()
)
ORDER BY created_at, row_id;
