DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'room_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.bookings
      ALTER COLUMN room_id DROP NOT NULL;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.create_assessment_booking(
  p_pet_id uuid,
  p_session_date date,
  p_session_start_time time,
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  invoice_id uuid,
  amount_aed numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $function$
DECLARE
  v_owner_id uuid;
  v_booking_id uuid;
  v_invoice_id uuid;
  v_amount numeric;
BEGIN
  IF EXTRACT(ISODOW FROM p_session_date) > 5 THEN
    RAISE EXCEPTION 'Assessment sessions are Mon-Fri only';
  END IF;

  IF p_session_start_time NOT IN (
    '10:00'::time,
    '11:00'::time,
    '12:00'::time,
    '13:00'::time,
    '14:00'::time
  ) THEN
    RAISE EXCEPTION 'Assessment slot must be 10:00, 11:00, 12:00, 13:00, or 14:00';
  END IF;

  SELECT owner_id
  INTO v_owner_id
  FROM public.pets
  WHERE id = p_pet_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Pet % not found', p_pet_id;
  END IF;

  SELECT r.amount_aed
  INTO v_amount
  FROM public.resolve_woof_service_rate(
    'assessment_with_first_hour'::public.service_code,
    NULL,
    NULL,
    p_session_date
  ) AS r
  LIMIT 1;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Missing rate for assessment_with_first_hour on %', p_session_date;
  END IF;

  INSERT INTO public.bookings (
    owner_id,
    room_id,
    check_in_date,
    check_out_date,
    booking_type,
    status,
    staff_id,
    notes,
    agent_notes
  )
  VALUES (
    v_owner_id,
    NULL,
    p_session_date,
    p_session_date + 1,
    'assessment'::public.booking_type,
    'confirmed'::public.booking_status,
    p_staff_id,
    p_notes,
    'Assessment session ' || p_session_start_time::text
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_pets (booking_id, pet_id)
  VALUES (v_booking_id, p_pet_id);

  UPDATE public.pets
  SET
    assessment_status = 'scheduled'::public.assessment_status,
    assessment_date = p_session_date
  WHERE id = p_pet_id;

  INSERT INTO public.invoices (
    owner_id,
    booking_id,
    issue_date,
    status,
    subtotal,
    subtotal_aed,
    total,
    total_aed,
    vat_aed,
    service_type
  )
  VALUES (
    v_owner_id,
    v_booking_id,
    CURRENT_DATE,
    'issued'::public.invoice_status,
    v_amount,
    v_amount,
    v_amount,
    v_amount,
    0,
    'assessment'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    total_price,
    service_type
  )
  VALUES (
    v_invoice_id,
    'Assessment + 1hr Daycare (' || p_session_start_time::text || ')',
    1,
    v_amount,
    v_amount,
    'assessment'
  );

  RETURN QUERY SELECT v_booking_id, v_invoice_id, v_amount;
END
$function$;
