-- Source invoices absorbed by consolidation get status 'consolidated' (not voided),
-- with balance zeroed (amount_paid = total). Debt lives on the merged invoice.

DO $$ BEGIN
  ALTER TYPE public.invoice_status ADD VALUE 'consolidated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.consolidate_owner_invoices(
  p_owner_id uuid,
  p_invoice_ids uuid[],
  p_performed_by text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_invoice_id uuid;
  v_src record;
  v_line record;
  v_adj record;
  v_total_paid numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_vat_aed numeric := 0;
  v_new_status invoice_status;
  v_open_statuses invoice_status[] := ARRAY[
    'draft'::invoice_status,
    'finalised'::invoice_status,
    'issued'::invoice_status,
    'outstanding'::invoice_status,
    'overdue'::invoice_status,
    'partially_paid'::invoice_status
  ];
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'consolidate_owner_invoices requires authenticated user';
  END IF;

  IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Select at least two invoices to consolidate';
  END IF;

  IF nullif(trim(p_performed_by), '') IS NULL THEN
    RAISE EXCEPTION 'p_performed_by is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND (
        i.owner_id <> p_owner_id
        OR i.status = ANY (
          ARRAY[
            'voided'::invoice_status,
            'consolidated'::invoice_status,
            'cancelled'::invoice_status,
            'paid'::invoice_status
          ]
        )
      )
  ) THEN
    RAISE EXCEPTION 'All selected invoices must belong to the owner and be open (not paid/voided/consolidated/cancelled)';
  END IF;

  IF (
    SELECT count(DISTINCT i.id)
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND i.owner_id = p_owner_id
      AND i.status = ANY (v_open_statuses)
  ) <> array_length(p_invoice_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected invoices were not found or are not eligible';
  END IF;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, discount_amount, total, vat_aed, amount_paid, service_type, notes
  ) VALUES (
    p_owner_id,
    CURRENT_DATE,
    'finalised'::invoice_status,
    0, 0, 0, 0, 0,
    'consolidated',
    'Consolidated invoice created by ' || trim(p_performed_by)
  )
  RETURNING id INTO v_new_invoice_id;

  FOR v_src IN
    SELECT i.*
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
    ORDER BY i.created_at
  LOOP
    v_total_paid := v_total_paid + coalesce(v_src.amount_paid, 0);
    v_subtotal := v_subtotal + coalesce(v_src.subtotal, 0);
    v_discount := v_discount + coalesce(v_src.discount_amount, 0);
    v_total := v_total + coalesce(v_src.total, 0);
    v_vat_aed := v_vat_aed + coalesce(v_src.vat_aed, 0);

    FOR v_line IN
      SELECT * FROM invoice_line_items WHERE invoice_id = v_src.id ORDER BY sort_order NULLS LAST, created_at
    LOOP
      INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price, total_price, line_total, service_type, pricing_key, sort_order
      ) VALUES (
        v_new_invoice_id,
        coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ': ' || v_line.description,
        v_line.quantity,
        v_line.unit_price,
        v_line.total_price,
        coalesce(v_line.line_total, v_line.total_price),
        v_line.service_type,
        v_line.pricing_key,
        v_line.sort_order
      );
    END LOOP;

    FOR v_adj IN
      SELECT * FROM billing_adjustments WHERE invoice_id = v_src.id
    LOOP
      INSERT INTO billing_adjustments (
        owner_id, invoice_id, adjustment_type, original_amount, adjusted_amount, reason, approved_by
      ) VALUES (
        p_owner_id,
        v_new_invoice_id,
        v_adj.adjustment_type,
        v_adj.original_amount,
        v_adj.adjusted_amount,
        coalesce(v_adj.reason, '') || ' (from ' || coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ')',
        coalesce(v_adj.approved_by, trim(p_performed_by))
      );
    END LOOP;

    UPDATE invoices
    SET status = 'consolidated'::invoice_status,
        amount_paid = total,
        updated_at = now()
    WHERE id = v_src.id;
  END LOOP;

  IF v_total_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'paid'::invoice_status;
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid'::invoice_status;
  ELSE
    v_new_status := 'outstanding'::invoice_status;
  END IF;

  UPDATE invoices
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      total = v_total,
      vat_aed = v_vat_aed,
      amount_paid = v_total_paid,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid'::invoice_status THEN now() ELSE NULL END
  WHERE id = v_new_invoice_id;

  INSERT INTO invoice_consolidation_log (owner_id, consolidated_invoice_id, source_invoice_ids, performed_by)
  VALUES (p_owner_id, v_new_invoice_id, p_invoice_ids, trim(p_performed_by));

  RETURN v_new_invoice_id;
END
$function$;

REVOKE ALL ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) TO service_role;

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
        AND i.status::TEXT NOT IN ('paid', 'voided', 'cancelled', 'consolidated')
      THEN (CURRENT_DATE - i.due_date)::INT
      ELSE 0
    END
  FROM public.invoices i
  WHERE i.owner_id = p_owner_id
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total  numeric;
  v_paid   numeric;
  v_status invoice_status;
BEGIN
  SELECT total, status INTO v_total, v_status
  FROM invoices WHERE id = NEW.invoice_id;

  IF v_status IN ('voided', 'consolidated') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM invoice_payments WHERE invoice_id = NEW.invoice_id;

  UPDATE invoices SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_paid <= 0       THEN 'outstanding'::invoice_status
      WHEN v_paid >= v_total THEN 'paid'::invoice_status
      ELSE                        'partially_paid'::invoice_status
    END,
    paid_at    = CASE WHEN v_paid >= v_total THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE invoices
SET status = 'consolidated',
    amount_paid = total,
    voided_at = NULL,
    voided_reason = NULL,
    voided_by = NULL
WHERE status = 'voided'
  AND voided_reason LIKE 'Consolidated into invoice%';

-- Verification (paste into Supabase SQL editor):
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'invoice_status' AND enumlabel = 'consolidated';
-- SELECT status, count(*) FROM invoices WHERE status = 'consolidated' GROUP BY status;
-- SELECT count(*) FROM invoices WHERE status = 'consolidated' AND coalesce(amount_paid, 0) < total;
-- SELECT prosrc FROM pg_proc WHERE proname = 'consolidate_owner_invoices';
