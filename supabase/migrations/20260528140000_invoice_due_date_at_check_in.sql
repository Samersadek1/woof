-- Payment due on check-in: default due_date from issue_date on insert, and keep
-- boarding invoices aligned when check_in_date changes.

CREATE OR REPLACE FUNCTION public.invoices_default_due_date_at_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := COALESCE(NEW.issue_date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_default_due_date_at_issue ON public.invoices;
CREATE TRIGGER invoices_default_due_date_at_issue
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_default_due_date_at_issue();

CREATE OR REPLACE FUNCTION public.sync_booking_invoice_due_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.check_in_date IS DISTINCT FROM OLD.check_in_date THEN
    UPDATE public.invoices
    SET due_date = NEW.check_in_date,
        updated_at = now()
    WHERE booking_id = NEW.id
      AND status <> 'voided'::invoice_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_sync_invoice_due_date ON public.bookings;
CREATE TRIGGER bookings_sync_invoice_due_date
  AFTER UPDATE OF check_in_date ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booking_invoice_due_dates();

-- Align existing boarding invoices to planned check-in.
UPDATE public.invoices i
SET due_date = b.check_in_date,
    updated_at = now()
FROM public.bookings b
WHERE i.booking_id = b.id
  AND i.status <> 'voided'::invoice_status
  AND i.due_date IS DISTINCT FROM b.check_in_date;

-- Package / manual invoices: due on issue date when still null.
UPDATE public.invoices
SET due_date = issue_date,
    updated_at = now()
WHERE due_date IS NULL
  AND issue_date IS NOT NULL
  AND status <> 'voided'::invoice_status;

-- Verification
SELECT
  COUNT(*) FILTER (WHERE booking_id IS NOT NULL AND due_date IS NULL) AS boarding_missing_due,
  COUNT(*) FILTER (WHERE booking_id IS NULL AND due_date IS NULL) AS other_missing_due
FROM public.invoices
WHERE status <> 'voided'::invoice_status;
