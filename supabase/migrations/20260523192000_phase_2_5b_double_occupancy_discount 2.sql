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
    AND ili.service_type IN ('boarding', 'boarding_night');

  RETURN ROUND(v_boarding_subtotal * 0.15, 2);
END
$function$;

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
BEGIN
  v_amount := public.calculate_double_occupancy_discount(p_booking_id);

  IF v_amount = 0 THEN
    DELETE FROM public.billing_adjustments
    WHERE booking_id = p_booking_id
      AND adjustment_type = 'double_occupancy_discount';
    RETURN NULL;
  END IF;

  SELECT id, owner_id
  INTO v_invoice_id, v_owner_id
  FROM public.invoices
  WHERE booking_id = p_booking_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'No invoice for booking %', p_booking_id;
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

  UPDATE public.invoices
  SET
    discount_amount = (
      SELECT COALESCE(SUM(-adjusted_amount), 0)
      FROM public.billing_adjustments
      WHERE invoice_id = v_invoice_id
    ),
    total = subtotal - (
      SELECT COALESCE(SUM(-adjusted_amount), 0)
      FROM public.billing_adjustments
      WHERE invoice_id = v_invoice_id
    ),
    updated_at = now()
  WHERE id = v_invoice_id;

  RETURN v_adjustment_id;
END
$function$;
