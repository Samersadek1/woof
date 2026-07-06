-- Board & Train rate seed + double-occupancy update (runs after service_code enum commit).

INSERT INTO public.service_code_meta (service_code, display_name, unit, applicable_species, description)
VALUES (
  'board_and_train_night',
  'Board & Train (per night)',
  'per_night',
  ARRAY['dog']::species[],
  'Overnight board and train program'
)
ON CONFLICT (service_code) DO NOTHING;

INSERT INTO public.service_rates (service_code, season, amount_aed)
SELECT v.service_code, v.season, v.amount_aed
FROM (
  VALUES
    ('board_and_train_night'::public.service_code, NULL::public.rate_season, 170.00::numeric)
) AS v(service_code, season, amount_aed)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_rates sr
  WHERE sr.service_code = v.service_code
    AND sr.pet_size IS NULL
    AND sr.coat_type IS NULL
    AND sr.season IS NULL
    AND sr.is_active = true
);

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
    AND ili.pricing_key IN ('boarding_night', 'board_and_train_night');

  RETURN ROUND(v_boarding_subtotal * 0.15, 2);
END
$function$;

-- Verification:
-- SELECT unnest(enum_range(NULL::public.boarding_type)) AS boarding_type_value;
-- SELECT service_code, season, amount_aed, is_active FROM public.service_rates WHERE service_code = 'board_and_train_night';
-- SELECT amount_aed FROM public.resolve_woof_service_rate('board_and_train_night', NULL, NULL, '2026-07-15'::date);
