-- collect_account_payment: single account-level payment allocated oldest-first
-- across collectable invoices. Wallet leg first, then external.

CREATE OR REPLACE FUNCTION public.collect_account_payment(
  p_owner_id        uuid,
  p_wallet_amount   numeric,
  p_external_amount numeric,
  p_external_method payment_method,
  p_performed_by    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_balance      numeric;
  v_wallet_balance_after numeric;
  v_total_payment       numeric;
  v_total_collectable   numeric;
  v_remaining_wallet    numeric;
  v_remaining_external  numeric;
  v_apply               numeric;
  v_opening             numeric;
  v_closing             numeric;
  v_invoices_affected   integer;
  v_allocations         jsonb;
  rec                   RECORD;
BEGIN
  IF COALESCE(p_wallet_amount, 0) < 0 OR COALESCE(p_external_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Payment amounts must be non-negative';
  END IF;

  v_total_payment := ROUND(COALESCE(p_wallet_amount, 0) + COALESCE(p_external_amount, 0), 3);
  IF v_total_payment <= 0 THEN
    RAISE EXCEPTION 'Total payment must be greater than zero';
  END IF;

  IF ROUND(COALESCE(p_external_amount, 0), 3) > 0 AND p_external_method IS NULL THEN
    RAISE EXCEPTION 'External payment method is required when external amount is greater than zero';
  END IF;

  IF ROUND(COALESCE(p_external_amount, 0), 3) > 0
     AND p_external_method NOT IN ('card', 'cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'External payment method must be card, cash, or bank_transfer';
  END IF;

  SELECT COALESCE(wallet_balance, 0)
  INTO v_wallet_balance
  FROM owners
  WHERE id = p_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner not found';
  END IF;

  IF ROUND(COALESCE(p_wallet_amount, 0), 3) > ROUND(v_wallet_balance, 3) THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  CREATE TEMP TABLE tmp_collect_invoices ON COMMIT DROP AS
  SELECT
    row_number() OVER (
      ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
    ) AS sort_order,
    i.id AS invoice_id,
    i.invoice_number::text AS invoice_number,
    ROUND(GREATEST(i.total - COALESCE(i.amount_paid, 0), 0), 3) AS balance,
    0::numeric AS wallet_applied,
    0::numeric AS external_applied
  FROM invoices i
  WHERE i.owner_id = p_owner_id
    AND i.receipt_only = false
    AND i.status IN ('outstanding', 'overdue', 'partially_paid')
    AND (i.total - COALESCE(i.amount_paid, 0)) > 0;

  SELECT COALESCE(SUM(balance), 0)
  INTO v_total_collectable
  FROM tmp_collect_invoices;

  IF v_total_collectable <= 0 THEN
    RAISE EXCEPTION 'No collectable invoices for this owner';
  END IF;

  IF v_total_payment > v_total_collectable THEN
    RAISE EXCEPTION 'Overpayment not allowed: total payment (%) exceeds collectable balance (%)',
      v_total_payment, v_total_collectable;
  END IF;

  -- ── Wallet allocation (oldest first) ─────────────────────────────────────
  v_remaining_wallet := ROUND(COALESCE(p_wallet_amount, 0), 3);

  IF v_remaining_wallet > 0 THEN
    FOR rec IN
      SELECT sort_order, invoice_id, balance
      FROM tmp_collect_invoices
      ORDER BY sort_order
    LOOP
      EXIT WHEN v_remaining_wallet <= 0;

      IF rec.balance <= 0 THEN
        CONTINUE;
      END IF;

      v_apply := ROUND(LEAST(v_remaining_wallet, rec.balance), 3);
      IF v_apply <= 0 THEN
        CONTINUE;
      END IF;

      v_opening := rec.balance;
      v_closing := ROUND(rec.balance - v_apply, 3);

      INSERT INTO invoice_payments (
        invoice_id,
        owner_id,
        amount,
        payment_method,
        recorded_by,
        opening_balance,
        closing_balance
      ) VALUES (
        rec.invoice_id,
        p_owner_id,
        v_apply,
        'wallet',
        COALESCE(NULLIF(trim(p_performed_by), ''), 'system'),
        v_opening,
        v_closing
      );

      UPDATE tmp_collect_invoices
      SET
        balance = v_closing,
        wallet_applied = wallet_applied + v_apply
      WHERE sort_order = rec.sort_order;

      v_remaining_wallet := ROUND(v_remaining_wallet - v_apply, 3);
    END LOOP;

    -- Single wallet ledger row for the full wallet leg
    v_wallet_balance_after := ROUND(v_wallet_balance - ROUND(COALESCE(p_wallet_amount, 0), 3), 3);

    INSERT INTO wallet_transactions (
      owner_id,
      transaction_type,
      amount,
      balance_after,
      reference_type,
      payment_method,
      performed_by,
      notes
    ) VALUES (
      p_owner_id,
      'deduction',
      -ROUND(COALESCE(p_wallet_amount, 0), 3),
      v_wallet_balance_after,
      'account_payment',
      'wallet',
      COALESCE(NULLIF(trim(p_performed_by), ''), 'system'),
      'Account payment via wallet'
    );
  END IF;

  -- ── External allocation (oldest first, reduced balances) ─────────────────
  v_remaining_external := ROUND(COALESCE(p_external_amount, 0), 3);

  IF v_remaining_external > 0 THEN
    FOR rec IN
      SELECT sort_order, invoice_id, balance
      FROM tmp_collect_invoices
      ORDER BY sort_order
    LOOP
      EXIT WHEN v_remaining_external <= 0;

      IF rec.balance <= 0 THEN
        CONTINUE;
      END IF;

      v_apply := ROUND(LEAST(v_remaining_external, rec.balance), 3);
      IF v_apply <= 0 THEN
        CONTINUE;
      END IF;

      v_opening := rec.balance;
      v_closing := ROUND(rec.balance - v_apply, 3);

      INSERT INTO invoice_payments (
        invoice_id,
        owner_id,
        amount,
        payment_method,
        recorded_by,
        opening_balance,
        closing_balance
      ) VALUES (
        rec.invoice_id,
        p_owner_id,
        v_apply,
        p_external_method,
        COALESCE(NULLIF(trim(p_performed_by), ''), 'system'),
        v_opening,
        v_closing
      );

      UPDATE tmp_collect_invoices
      SET
        balance = v_closing,
        external_applied = external_applied + v_apply
      WHERE sort_order = rec.sort_order;

      v_remaining_external := ROUND(v_remaining_external - v_apply, 3);
    END LOOP;
  END IF;

  SELECT COUNT(*)
  INTO v_invoices_affected
  FROM tmp_collect_invoices
  WHERE wallet_applied + external_applied > 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'invoice_id', invoice_id,
        'invoice_number', invoice_number,
        'wallet_amount', wallet_applied,
        'external_amount', external_applied
      )
      ORDER BY sort_order
    ),
    '[]'::jsonb
  )
  INTO v_allocations
  FROM tmp_collect_invoices
  WHERE wallet_applied + external_applied > 0;

  RETURN jsonb_build_object(
    'total_collected', v_total_payment,
    'wallet_applied', ROUND(COALESCE(p_wallet_amount, 0), 3),
    'external_applied', ROUND(COALESCE(p_external_amount, 0), 3),
    'invoices_affected', v_invoices_affected,
    'allocations', v_allocations
  );
END;
$$;

-- Verification (paste into Supabase SQL editor):
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc WHERE proname = 'collect_account_payment';
