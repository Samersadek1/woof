-- Mandatory wallet top-up receipts: backfill orphans, 1:1 enforcement, trigger safety net, RPC.

-- 1a. Backfill historical top-ups missing receipts
INSERT INTO public.wallet_topup_receipts (
  owner_id,
  wallet_transaction_id,
  amount,
  issued_by,
  receipt_number,
  issued_at,
  notes
)
SELECT
  wt.owner_id,
  wt.id,
  ABS(wt.amount),
  COALESCE(NULLIF(TRIM(wt.performed_by), ''), 'reception'),
  'RCP-' || (EXTRACT(EPOCH FROM wt.created_at) * 1000)::bigint,
  wt.created_at,
  wt.notes
FROM public.wallet_transactions wt
WHERE wt.transaction_type IN ('top_up', 'manual_topup')
  AND wt.amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallet_topup_receipts r
    WHERE r.wallet_transaction_id = wt.id
  );

-- 1b. One receipt per top-up transaction
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_topup_receipts_wallet_tx
  ON public.wallet_topup_receipts (wallet_transaction_id);

-- 1c. Safety-net trigger for direct inserts (ingest scripts, legacy paths)
CREATE OR REPLACE FUNCTION public.ensure_wallet_topup_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.transaction_type IN ('top_up', 'manual_topup') AND NEW.amount > 0 THEN
    INSERT INTO public.wallet_topup_receipts (
      owner_id,
      wallet_transaction_id,
      amount,
      issued_by,
      receipt_number,
      issued_at,
      notes
    ) VALUES (
      NEW.owner_id,
      NEW.id,
      ABS(NEW.amount),
      COALESCE(NULLIF(TRIM(NEW.performed_by), ''), 'reception'),
      'RCP-' || (EXTRACT(EPOCH FROM COALESCE(NEW.created_at, now())) * 1000)::bigint,
      COALESCE(NEW.created_at, now()),
      NEW.notes
    )
    ON CONFLICT (wallet_transaction_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_wallet_topup_receipt ON public.wallet_transactions;

CREATE TRIGGER trg_ensure_wallet_topup_receipt
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_wallet_topup_receipt();

-- 1d. Atomic staff top-up RPC (transaction + receipt + balance)
CREATE OR REPLACE FUNCTION public.credit_wallet_topup(
  p_owner_id uuid,
  p_amount numeric,
  p_transaction_type public.transaction_type DEFAULT 'top_up'::public.transaction_type,
  p_performed_by text DEFAULT 'reception'::text,
  p_payment_method public.payment_method DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_amount numeric;
  v_tx_id uuid;
  v_receipt public.wallet_topup_receipts%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_transaction_type NOT IN ('top_up', 'manual_topup') THEN
    RAISE EXCEPTION 'Transaction type must be top_up or manual_topup';
  END IF;

  v_amount := ROUND(ABS(p_amount), 2);

  SELECT wallet_balance
  INTO v_balance
  FROM public.owners
  WHERE id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner not found';
  END IF;

  v_balance := COALESCE(v_balance, 0);
  v_new_balance := ROUND(v_balance + v_amount, 2);

  INSERT INTO public.wallet_transactions (
    owner_id,
    transaction_type,
    amount,
    balance_after,
    notes,
    payment_method,
    staff_id,
    performed_by
  ) VALUES (
    p_owner_id,
    p_transaction_type,
    v_amount,
    v_new_balance,
    NULLIF(TRIM(p_notes), ''),
    p_payment_method,
    p_staff_id,
    COALESCE(NULLIF(TRIM(p_performed_by), ''), 'reception')
  )
  RETURNING id INTO v_tx_id;

  -- Trigger creates the receipt; idempotent fallback if trigger did not run
  INSERT INTO public.wallet_topup_receipts (
    owner_id,
    wallet_transaction_id,
    amount,
    issued_by,
    receipt_number,
    issued_at,
    notes
  ) VALUES (
    p_owner_id,
    v_tx_id,
    v_amount,
    COALESCE(NULLIF(TRIM(p_performed_by), ''), 'reception'),
    'RCP-' || (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    now(),
    NULLIF(TRIM(p_notes), '')
  )
  ON CONFLICT (wallet_transaction_id) DO NOTHING;

  UPDATE public.owners
  SET wallet_balance = v_new_balance
  WHERE id = p_owner_id;

  SELECT *
  INTO v_receipt
  FROM public.wallet_topup_receipts
  WHERE wallet_transaction_id = v_tx_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt was not created for wallet top-up';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'wallet_transaction_id', v_tx_id,
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'balance_after', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_wallet_topup(
  uuid,
  numeric,
  public.transaction_type,
  text,
  public.payment_method,
  text,
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.credit_wallet_topup(
  uuid,
  numeric,
  public.transaction_type,
  text,
  public.payment_method,
  text,
  uuid
) TO service_role;

-- Verification (paste after apply):
-- SELECT COUNT(*) AS missing_receipts FROM wallet_transactions wt
-- WHERE wt.transaction_type IN ('top_up','manual_topup') AND wt.amount > 0
--   AND NOT EXISTS (SELECT 1 FROM wallet_topup_receipts r WHERE r.wallet_transaction_id = wt.id);
-- SELECT indexname FROM pg_indexes WHERE tablename = 'wallet_topup_receipts'
--   AND indexdef LIKE '%wallet_transaction_id%';
