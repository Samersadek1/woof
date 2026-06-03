-- update_invoice_status_on_payment: emit 'paid' (not 'finalised') on full payment.
--
-- Context: the live DB had this trigger setting status = 'finalised' when an
-- invoice was fully paid. But 'finalised' in this project means zero-value /
-- no-charge closure (26 daycare invoices, all total = 0), while genuinely
-- settled invoices use 'paid' (571 rows). This realigns new full payments with
-- the existing 'paid' population so reporting (lifetime spend, dashboard
-- revenue, "Settled" filter, statement balance) stays consistent.
--
-- Idempotent: CREATE OR REPLACE. Recomputes amount_paid from SUM(invoice_payments)
-- and never resurrects a voided invoice.

CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total  numeric;
  v_paid   numeric;
  v_status invoice_status;
BEGIN
  SELECT total, status INTO v_total, v_status
  FROM invoices WHERE id = NEW.invoice_id;

  -- Never resurrect a voided invoice
  IF v_status = 'voided' THEN
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

-- Verification (paste into the Supabase SQL editor):
-- SELECT prosrc FROM pg_proc WHERE proname = 'update_invoice_status_on_payment';
-- SELECT COUNT(*) FROM invoices WHERE status = 'finalised' AND receipt_only = false; -- expect 26
-- SELECT COUNT(*) FROM invoices WHERE status = 'paid' AND receipt_only = false;      -- expect 571
