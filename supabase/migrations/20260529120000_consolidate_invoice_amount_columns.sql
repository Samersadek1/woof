-- Consolidate invoice money columns: keep subtotal, discount_amount, total, vat_aed only.
-- Drops duplicate subtotal_aed, discount_aed, total_aed.

-- ── 1. Backfill canonical columns from best available value ─────────────────
UPDATE public.invoices
SET subtotal = COALESCE(NULLIF(subtotal, 0), NULLIF(subtotal_aed, 0), 0)
WHERE COALESCE(subtotal, 0) = 0 AND COALESCE(subtotal_aed, 0) > 0;

UPDATE public.invoices
SET discount_amount = COALESCE(NULLIF(discount_amount, 0), NULLIF(discount_aed, 0), 0)
WHERE COALESCE(discount_amount, 0) = 0 AND COALESCE(discount_aed, 0) > 0;

-- When total and total_aed diverge, total is post-discount (authoritative).
UPDATE public.invoices
SET
  total = COALESCE(NULLIF(total, 0), NULLIF(total_aed, 0), 0),
  discount_amount = GREATEST(
    COALESCE(discount_amount, 0),
    CASE
      WHEN COALESCE(total_aed, 0) > COALESCE(NULLIF(total, 0), 0)
        THEN ROUND(COALESCE(total_aed, 0) - COALESCE(NULLIF(total, 0), 0), 2)
      ELSE 0
    END
  )
WHERE COALESCE(total_aed, 0) IS DISTINCT FROM COALESCE(NULLIF(total, 0), 0)
   OR COALESCE(total, 0) = 0;

UPDATE public.invoices
SET total = COALESCE(NULLIF(total, 0), NULLIF(total_aed, 0), 0)
WHERE COALESCE(total, 0) = 0 AND COALESCE(total_aed, 0) > 0;

UPDATE public.invoices
SET discount_pct = CASE
  WHEN COALESCE(subtotal, 0) > 0 AND COALESCE(discount_amount, 0) > 0
    THEN ROUND((discount_amount / subtotal) * 100, 2)
  ELSE COALESCE(discount_pct, 0)
END;

-- Recalculate VAT on gross-inclusive totals where vat_aed is tracked.
UPDATE public.invoices
SET vat_aed = ROUND(total - (total / 1.05), 2)
WHERE vat_aed IS NOT NULL
  AND total > 0;

-- ── 2. Double occupancy discount: write canonical columns + VAT ─────────────
CREATE OR REPLACE FUNCTION public.apply_double_occupancy_discount(
  p_booking_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $function$
DECLARE
  v_amount numeric;
  v_invoice_id uuid;
  v_existing_id uuid;
  v_adjustment_id uuid;
  v_owner_id uuid;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_vat numeric;
BEGIN
  v_amount := public.calculate_double_occupancy_discount(p_booking_id);

  SELECT id, owner_id, COALESCE(subtotal, 0)
  INTO v_invoice_id, v_owner_id, v_subtotal
  FROM public.invoices
  WHERE booking_id = p_booking_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    IF v_amount = 0 THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'No invoice for booking %', p_booking_id;
  END IF;

  IF v_amount = 0 THEN
    DELETE FROM public.billing_adjustments
    WHERE booking_id = p_booking_id
      AND adjustment_type = 'double_occupancy_discount';

    UPDATE public.invoices
    SET
      discount_amount = 0,
      discount_pct = 0,
      total = v_subtotal,
      vat_aed = CASE
        WHEN vat_aed IS NOT NULL AND v_subtotal > 0
          THEN ROUND(v_subtotal - (v_subtotal / 1.05), 2)
        ELSE vat_aed
      END,
      updated_at = now()
    WHERE id = v_invoice_id;

    RETURN NULL;
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.billing_adjustments
  WHERE booking_id = p_booking_id
    AND adjustment_type = 'double_occupancy_discount';

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.billing_adjustments
    SET
      adjusted_amount = -v_amount,
      reason = 'Double occupancy 15% discount (' ||
        (SELECT COUNT(*) FROM public.booking_pets WHERE booking_id = p_booking_id)::text ||
        ' pets sharing room)',
      approved_by = 'system'
    WHERE id = v_existing_id;

    v_adjustment_id := v_existing_id;
  ELSE
    INSERT INTO public.billing_adjustments (
      owner_id,
      booking_id,
      invoice_id,
      adjustment_type,
      original_amount,
      adjusted_amount,
      reason,
      approved_by
    )
    VALUES (
      v_owner_id,
      p_booking_id,
      v_invoice_id,
      'double_occupancy_discount',
      v_amount,
      -v_amount,
      'Double occupancy 15% discount (' ||
        (SELECT COUNT(*) FROM public.booking_pets WHERE booking_id = p_booking_id)::text ||
        ' pets sharing room)',
      'system'
    )
    RETURNING id INTO v_adjustment_id;
  END IF;

  SELECT COALESCE(SUM(-adjusted_amount), 0)
  INTO v_discount
  FROM public.billing_adjustments
  WHERE invoice_id = v_invoice_id;

  v_total := GREATEST(0, ROUND(v_subtotal - v_discount, 2));
  v_vat := CASE
    WHEN (SELECT vat_aed FROM public.invoices WHERE id = v_invoice_id) IS NOT NULL
      THEN ROUND(v_total - (v_total / 1.05), 2)
    ELSE NULL
  END;

  UPDATE public.invoices
  SET
    discount_amount = v_discount,
    discount_pct = CASE
      WHEN v_subtotal > 0 THEN ROUND((v_discount / v_subtotal) * 100, 2)
      ELSE 0
    END,
    total = v_total,
    vat_aed = v_vat,
    updated_at = now()
  WHERE id = v_invoice_id;

  RETURN v_adjustment_id;
END
$function$;

-- ── 3. Payment / statement RPCs: read `total` only ──────────────────────────
DROP FUNCTION IF EXISTS public.process_wallet_payment(uuid, text);
DROP FUNCTION IF EXISTS public.get_statement_of_account(uuid);
DROP FUNCTION IF EXISTS public.calculate_cancellation_refund(uuid, uuid, text);

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
  v_amount numeric;
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  SELECT owner_id, COALESCE(total, 0)
  INTO v_owner_id, v_amount
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"Invoice not found"}'::json;
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

  UPDATE public.invoices
  SET
    status = 'paid',
    payment_method = 'wallet',
    paid_at = NOW(),
    amount_paid = v_amount
  WHERE id = p_invoice_id;

  INSERT INTO public.wallet_transactions
    (owner_id, transaction_type, amount, balance_after, invoice_id, performed_by, notes)
  VALUES
    (v_owner_id, 'deduction', -v_amount, v_new_balance, p_invoice_id, p_performed_by, 'Invoice payment via wallet');

  RETURN json_build_object(
    'success', true,
    'amount_charged', v_amount,
    'new_balance', v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_statement_of_account(p_owner_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number character varying,
  service_type character varying,
  status text,
  total numeric,
  created_at timestamp with time zone,
  due_date date,
  days_overdue integer
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
        ROUND(COALESCE(i.total, 0), 2)
      ELSE
        ROUND(COALESCE(i.total, 0) + ROUND(COALESCE(i.total, 0) * 0.05, 2), 2)
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
  FROM public.invoices i
  WHERE i.owner_id = p_owner_id
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_cancellation_refund(
  p_owner_id uuid,
  p_invoice_id uuid,
  p_service_start text
)
RETURNS TABLE (
  hours_notice numeric,
  refund_pct numeric,
  refund_aed numeric,
  override_active boolean,
  policy_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stored numeric;
  v_vat_aed numeric;
  v_service_type varchar;
  v_notes text;
  v_invoice_total numeric;
  v_hours numeric;
  v_pct numeric;
  v_label text;
BEGIN
  SELECT COALESCE(total, 0), vat_aed, service_type, notes
  INTO v_stored, v_vat_aed, v_service_type, v_notes
  FROM public.invoices
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
    v_pct := 100; v_label := 'Full refund (72+ hrs notice)';
  ELSIF v_hours >= 48 THEN
    v_pct := 75;  v_label := '75% refund (48–72 hrs notice)';
  ELSIF v_hours >= 24 THEN
    v_pct := 50;  v_label := '50% refund (24–48 hrs notice)';
  ELSE
    v_pct := 0;   v_label := 'No refund (less than 24 hrs notice)';
  END IF;

  RETURN QUERY SELECT
    ROUND(v_hours, 1),
    v_pct,
    ROUND(v_invoice_total * v_pct / 100.0, 2),
    FALSE,
    v_label;
END;
$$;

-- ── 4. Drop duplicate columns ───────────────────────────────────────────────
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS subtotal_aed,
  DROP COLUMN IF EXISTS discount_aed,
  DROP COLUMN IF EXISTS total_aed;

-- Verification (paste result back after apply):
-- SELECT invoice_number, subtotal, discount_amount, total, vat_aed
-- FROM invoices
-- WHERE invoice_number = 'INV-2026-02341';
