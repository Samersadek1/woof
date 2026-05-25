-- Align dashboard boarding occupancy with computeBoardingOccupancyStats (kennel pool + BRA + unassigned).

CREATE OR REPLACE FUNCTION public.is_boarding_import_placeholder_room(p_room public.rooms)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p_room.room_number, '') LIKE 'UNK-%'
    OR COALESCE(p_room.display_name, '') LIKE 'Unknown ·%'
    OR COALESCE(p_room.display_name, '') LIKE 'Unknown -%'
    OR COALESCE(p_room.notes, '') LIKE '%import_placeholder_tier=%'
$$;

CREATE OR REPLACE FUNCTION public.is_kennel_occupancy_room(p_room public.rooms)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_room.is_active
    AND p_room.wing IS DISTINCT FROM 'cattery'
    AND p_room.wing IS DISTINCT FROM 'grooming_upstairs'
    AND NOT public.is_boarding_import_placeholder_room(p_room)
    AND UPPER(TRIM(COALESCE(p_room.room_number, ''))) NOT IN ('F100', 'D100')
$$;

CREATE OR REPLACE FUNCTION public.boarding_kennel_occupancy_counts(p_as_of date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH pool AS (
    SELECT r.id
    FROM public.rooms r
    WHERE public.is_kennel_occupancy_room(r)
  ),
  on_site AS (
    SELECT b.id, b.room_id
    FROM public.bookings b
    WHERE b.booking_type = 'boarding'
      AND b.status <> 'cancelled'
      AND b.check_in_date <= p_as_of
      AND b.check_out_date > p_as_of
  ),
  booking_ids_handled AS (
    SELECT DISTINCT bra.booking_id
    FROM public.booking_room_assignments bra
    INNER JOIN public.rooms r ON r.id = bra.room_id
    WHERE bra.start_date <= p_as_of
      AND bra.end_date >= p_as_of
      AND (
        EXISTS (SELECT 1 FROM pool p WHERE p.id = bra.room_id)
        OR public.is_boarding_import_placeholder_room(r)
      )
  ),
  rooms_occupied AS (
    SELECT COUNT(DISTINCT sub.room_id)::int AS n
    FROM (
      SELECT bra.room_id
      FROM public.booking_room_assignments bra
      INNER JOIN pool p ON p.id = bra.room_id
      WHERE bra.start_date <= p_as_of
        AND bra.end_date >= p_as_of
      UNION ALL
      SELECT b.room_id
      FROM on_site b
      INNER JOIN pool p ON p.id = b.room_id
      WHERE b.room_id IS NOT NULL
        AND b.id NOT IN (SELECT booking_id FROM booking_ids_handled)
    ) sub
    WHERE sub.room_id IS NOT NULL
  ),
  unassigned_guests AS (
    SELECT COUNT(*)::int AS n
    FROM on_site b
    WHERE b.id NOT IN (SELECT booking_id FROM booking_ids_handled)
      AND (
        b.room_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM pool p WHERE p.id = b.room_id)
      )
  ),
  total_rooms AS (
    SELECT COUNT(*)::int AS n FROM pool
  )
  SELECT jsonb_build_object(
    'boarding_total_rooms', (SELECT n FROM total_rooms),
    'boarding_rooms_occupied', (SELECT n FROM rooms_occupied),
    'boarding_unassigned_guests', (SELECT n FROM unassigned_guests),
    'boarding_occupied', (SELECT n FROM rooms_occupied) + (SELECT n FROM unassigned_guests)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_occ jsonb;
BEGIN
  v_occ := public.boarding_kennel_occupancy_counts(p_as_of);

  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'today', jsonb_build_object(
      'check_ins', (
        SELECT COUNT(*)
        FROM bookings
        WHERE booking_type = 'boarding'
          AND check_in_date = p_as_of
          AND status <> 'cancelled'
      ),
      'check_outs', (
        SELECT COUNT(*)
        FROM bookings
        WHERE booking_type = 'boarding'
          AND check_out_date = p_as_of
          AND status <> 'cancelled'
      ),
      'daycare_attending', (
        SELECT COUNT(*)
        FROM daycare_sessions
        WHERE session_date = p_as_of
          AND checked_in = true
      ),
      'park_bookings', 0,
      'grooming_appointments', (
        SELECT COUNT(*)
        FROM grooming_appointments
        WHERE appointment_date = p_as_of
          AND status <> 'cancelled'
      ),
      'assessments_scheduled', 0
    ),
    'occupancy', jsonb_build_object(
      'boarding_occupied', COALESCE((v_occ->>'boarding_occupied')::int, 0),
      'boarding_rooms_occupied', COALESCE((v_occ->>'boarding_rooms_occupied')::int, 0),
      'boarding_unassigned_guests', COALESCE((v_occ->>'boarding_unassigned_guests')::int, 0),
      'boarding_total_rooms', COALESCE((v_occ->>'boarding_total_rooms')::int, 0),
      'cattery_occupied', 0,
      'cattery_total_rooms', 0
    ),
    'alerts', jsonb_build_object(
      'overdue_invoices_count', (
        SELECT COUNT(*)
        FROM invoices
        WHERE status = 'overdue'
      ),
      'overdue_invoices_aed', (
        SELECT COALESCE(SUM(COALESCE(NULLIF(total_aed, 0), total)), 0)
        FROM invoices
        WHERE status = 'overdue'
      ),
      'outstanding_invoices_count', (
        SELECT COUNT(*)
        FROM invoices
        WHERE status IN ('outstanding', 'overdue')
      ),
      'outstanding_invoices_aed', (
        SELECT COALESCE(SUM(COALESCE(NULLIF(total_aed, 0), total)), 0)
        FROM invoices
        WHERE status IN ('outstanding', 'overdue')
      ),
      'low_wallet_members', 0,
      'pets_unassessed', (
        SELECT COUNT(*)
        FROM pets
        WHERE assessment_status = 'not_assessed'
          AND species = 'dog'
      ),
      'vaccinations_expiring_30d', (
        SELECT COUNT(*)
        FROM vaccinations
        WHERE expiry_date BETWEEN p_as_of AND p_as_of + 30
      ),
      'vaccinations_expired', (
        SELECT COUNT(*)
        FROM vaccinations
        WHERE expiry_date < p_as_of
      )
    ),
    'financial_7d', jsonb_build_object(
      'invoiced', (
        SELECT COALESCE(SUM(COALESCE(NULLIF(total_aed, 0), total)), 0)
        FROM invoices
        WHERE created_at::date >= p_as_of - 7
          AND status <> 'voided'
      ),
      'collected', (
        SELECT COALESCE(SUM(amount), 0)
        FROM wallet_transactions
        WHERE created_at::date >= p_as_of - 7
          AND transaction_type IN ('cash_payment', 'card_payment', 'top_up')
      ),
      'refunded', (
        SELECT COALESCE(SUM(amount), 0)
        FROM wallet_transactions
        WHERE created_at::date >= p_as_of - 7
          AND transaction_type = 'refund'
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;
