BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
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
      'boarding_occupied', (
        SELECT COUNT(DISTINCT b.room_id)
        FROM bookings b
        WHERE b.booking_type = 'boarding'
          AND b.status IN ('confirmed', 'checked_in')
          AND b.check_in_date <= p_as_of
          AND b.check_out_date > p_as_of
      ),
      'boarding_total_rooms', (
        SELECT COUNT(*)
        FROM rooms
        WHERE is_active = true
      ),
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

COMMIT;
