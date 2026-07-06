-- process_wallet_payment: always write invoice_payments (unified ledger source).
-- Fixes wallet deductions that debited the wallet but never created a payment row.

CREATE OR REPLACE FUNCTION public.process_wallet_payment(
  p_invoice_id uuid,
  p_performed_by text DEFAULT 'system'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner_id uuid;
  v_status invoice_status;
  v_stored numeric;
  v_vat_aed numeric;
  v_service_type character varying;
  v_notes text;
  v_gross numeric;
  v_amount numeric;
  v_balance numeric;
  v_new_balance numeric;
  v_wallet_tx_id uuid;
  v_already_paid numeric;
BEGIN
  SELECT
    i.owner_id,
    i.status,
    COALESCE(i.total, 0),
    i.vat_aed,
    i.service_type,
    i.notes,
    ROUND(COALESCE(i.amount_paid, 0), 2)
  INTO v_owner_id, v_status, v_stored, v_vat_aed, v_service_type, v_notes, v_already_paid
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"Invoice not found"}'::json;
  END IF;

  IF v_status IN ('voided', 'consolidated', 'cancelled') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot pay a closed invoice');
  END IF;

  IF v_vat_aed IS NOT NULL
    OR v_service_type IN ('package', 'daycare')
    OR COALESCE(v_notes, '') LIKE 'Legacy daycare package purchase%' THEN
    v_gross := ROUND(v_stored, 2);
  ELSE
    v_gross := ROUND(v_stored + ROUND(v_stored * 0.05, 2), 2);
  END IF;

  v_amount := ROUND(GREATEST(0, v_gross - v_already_paid), 2);
  IF v_amount <= 0 THEN
    RETURN json_build_object('success', true, 'amount_charged', 0);
  END IF;

  SELECT wallet_balance INTO v_balance FROM public.owners WHERE id = v_owner_id;

  IF v_balance < v_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'shortfall', ROUND(v_amount - v_balance, 2)
    );
  END IF;

  v_new_balance := ROUND(v_balance - v_amount, 2);

  UPDATE public.owners SET wallet_balance = v_new_balance WHERE id = v_owner_id;

  INSERT INTO public.wallet_transactions (
    owner_id,
    transaction_type,
    amount,
    balance_after,
    invoice_id,
    payment_method,
    performed_by,
    notes
  ) VALUES (
    v_owner_id,
    'deduction',
    -v_amount,
    v_new_balance,
    p_invoice_id,
    'wallet'::public.payment_method,
    COALESCE(NULLIF(trim(p_performed_by), ''), 'system'),
    'Invoice payment via wallet'
  )
  RETURNING id INTO v_wallet_tx_id;

  INSERT INTO public.invoice_payments (
    invoice_id,
    owner_id,
    amount,
    payment_method,
    wallet_transaction_id,
    opening_balance,
    closing_balance,
    recorded_by,
    notes
  ) VALUES (
    p_invoice_id,
    v_owner_id,
    v_amount,
    'wallet'::public.payment_method,
    v_wallet_tx_id,
    v_balance,
    v_new_balance,
    COALESCE(NULLIF(trim(p_performed_by), ''), 'system'),
    'Invoice payment via wallet'
  );

  RETURN json_build_object(
    'success', true,
    'amount_charged', v_amount,
    'new_balance', v_new_balance,
    'wallet_transaction_id', v_wallet_tx_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_wallet_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_wallet_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_wallet_payment(uuid, text) TO service_role;

-- Verification:
-- SELECT prosrc FROM pg_proc WHERE proname = 'process_wallet_payment';
