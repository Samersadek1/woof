-- Double occupancy 15% applies to boarding night lines only, not manual add-ons
-- (e.g. vet bills) that were tagged service_type = 'boarding'.

CREATE OR REPLACE FUNCTION public.calculate_double_occupancy_discount(
  p_booking_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $function$
DECLARE
  v_pet_count int;
  v_booking_type public.booking_type;
  v_boarding_subtotal numeric;
BEGIN
  SELECT booking_type
  INTO v_booking_type
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking_type IS DISTINCT FROM 'boarding'::public.booking_type THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO v_pet_count
  FROM public.booking_pets
  WHERE booking_id = p_booking_id;

  IF v_pet_count < 2 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(ili.total_price), 0)
  INTO v_boarding_subtotal
  FROM public.invoices i
  JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
  WHERE i.booking_id = p_booking_id
    AND i.status IS DISTINCT FROM 'voided'
    AND ili.pricing_key = 'boarding_night';

  RETURN ROUND(v_boarding_subtotal * 0.15, 2);
END
$function$;

-- Verification (expect boarding-night sum * 0.15 for multi-pet stays):
-- SELECT b.booking_ref,
--        public.calculate_double_occupancy_discount(b.id) AS discount_aed
-- FROM public.bookings b
-- WHERE b.booking_ref = 'WOOF-2026-00818';
