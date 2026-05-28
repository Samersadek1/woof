-- Daycare and package prices are VAT-inclusive. Align stored vat_aed and payment RPCs.

BEGIN;

UPDATE public.invoices i
SET
  vat_aed = CASE
    WHEN COALESCE(i.total_aed, i.total, 0) > 0 THEN
      ROUND(COALESCE(i.total_aed, i.total, 0) - (COALESCE(i.total_aed, i.total, 0) / 1.05), 2)
    ELSE 0
  END,
  updated_at = NOW()
WHERE (
    i.service_type IN ('package', 'daycare')
    OR i.notes LIKE 'Legacy daycare package purchase%'
  )
  AND i.vat_aed IS NULL;

CREATE OR REPLACE FUNCTION public.process_wallet_payment(
  p_invoice_id   UUID,
  p_performed_by TEXT DEFAULT 'system'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner_id     UUID;
  v_stored       NUMERIC;
  v_vat_aed      NUMERIC;
  v_service_type VARCHAR;
  v_notes        TEXT;
  v_amount       NUMERIC;
  v_balance      NUMERIC;
  v_new_balance  NUMERIC;
BEGIN
  SELECT owner_id,
         COALESCE(total_aed, total, 0),
         vat_aed,
         service_type,
         notes
  INTO v_owner_id, v_stored, v_vat_aed, v_service_type, v_notes
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"Invoice not found"}'::JSON;
  END IF;

  IF v_vat_aed IS NOT NULL
     OR v_service_type IN ('package', 'daycare')
     OR v_notes LIKE 'Legacy daycare package purchase%' THEN
    v_amount := ROUND(v_stored, 2);
  ELSE
    v_amount := ROUND(v_stored + ROUND(v_stored * 0.05, 2), 2);
  END IF;

  SELECT wallet_balance INTO v_balance FROM owners WHERE id = v_owner_id;

  IF v_balance < v_amount THEN
    RETURN json_build_object(
      'success',   false,
      'error',     'Insufficient wallet balance',
      'shortfall', ROUND(v_amount - v_balance, 2)
    );
  END IF;

  v_new_balance := ROUND(v_balance - v_amount, 2);

  UPDATE owners SET wallet_balance = v_new_balance WHERE id = v_owner_id;

  UPDATE invoices SET
    status         = 'paid',
    payment_method = 'wallet',
    paid_at        = NOW(),
    amount_paid    = v_amount
  WHERE id = p_invoice_id;

  INSERT INTO wallet_transactions
    (owner_id, transaction_type, amount, balance_after, invoice_id, performed_by, notes)
  VALUES
    (v_owner_id, 'deduction', -v_amount, v_new_balance, p_invoice_id, p_performed_by, 'Invoice payment via wallet');

  RETURN json_build_object(
    'success',        true,
    'amount_charged', v_amount,
    'new_balance',    v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_statement_of_account(p_owner_id UUID)
RETURNS TABLE (
  invoice_id     UUID,
  invoice_number VARCHAR,
  service_type   VARCHAR,
  status         TEXT,
  total_aed      NUMERIC,
  created_at     TIMESTAMPTZ,
  due_date       DATE,
  days_overdue   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.service_type,
    i.status::TEXT,
    CASE
      WHEN i.vat_aed IS NOT NULL
        OR i.service_type IN ('package', 'daycare')
        OR i.notes LIKE 'Legacy daycare package purchase%' THEN
        ROUND(COALESCE(i.total_aed, i.total, 0), 2)
      ELSE
        ROUND(COALESCE(i.total_aed, i.total, 0) + ROUND(COALESCE(i.total_aed, i.total, 0) * 0.05, 2), 2)
    END,
    i.created_at,
    i.due_date,
    CASE
      WHEN i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND i.status::TEXT NOT IN ('paid', 'voided', 'cancelled')
      THEN (CURRENT_DATE - i.due_date)::INT
      ELSE 0
    END
  FROM invoices i
  WHERE i.owner_id = p_owner_id
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_cancellation_refund(
  p_owner_id    UUID,
  p_invoice_id  UUID,
  p_service_start TEXT
)
RETURNS TABLE (
  hours_notice    NUMERIC,
  refund_pct      NUMERIC,
  refund_aed      NUMERIC,
  override_active BOOLEAN,
  policy_label    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_total NUMERIC;
  v_stored        NUMERIC;
  v_vat_aed       NUMERIC;
  v_service_type  VARCHAR;
  v_notes         TEXT;
  v_hours         NUMERIC;
  v_pct           NUMERIC;
  v_label         TEXT;
BEGIN
  SELECT COALESCE(total_aed, total, 0), vat_aed, service_type, notes
  INTO v_stored, v_vat_aed, v_service_type, v_notes
  FROM invoices
  WHERE id = p_invoice_id;

  IF v_vat_aed IS NOT NULL
     OR v_service_type IN ('package', 'daycare')
     OR v_notes LIKE 'Legacy daycare package purchase%' THEN
    v_invoice_total := ROUND(v_stored, 2);
  ELSE
    v_invoice_total := ROUND(v_stored + ROUND(v_stored * 0.05, 2), 2);
  END IF;

  v_hours := EXTRACT(EPOCH FROM (p_service_start::TIMESTAMPTZ - NOW())) / 3600.0;
  v_hours := GREATEST(v_hours, 0);

  IF v_hours >= 72 THEN
    v_pct   := 100; v_label := 'Full refund (72+ hrs notice)';
  ELSIF v_hours >= 48 THEN
    v_pct   := 75;  v_label := '75% refund (48–72 hrs notice)';
  ELSIF v_hours >= 24 THEN
    v_pct   := 50;  v_label := '50% refund (24–48 hrs notice)';
  ELSE
    v_pct   := 0;   v_label := 'No refund (less than 24 hrs notice)';
  END IF;

  RETURN QUERY SELECT
    ROUND(v_hours, 1),
    v_pct,
    ROUND(v_invoice_total * v_pct / 100.0, 2),
    FALSE,
    v_label;
END;
$$;

COMMIT;
