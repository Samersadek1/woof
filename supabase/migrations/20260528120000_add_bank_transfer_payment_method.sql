-- Add bank_transfer payment method and matching audit transaction type.

DO $$ BEGIN
  ALTER TYPE public.payment_method ADD VALUE 'bank_transfer';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.transaction_type ADD VALUE 'bank_transfer_payment';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Include bank transfer payments in dashboard collected revenue (7d window).
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
          AND transaction_type IN (
            'cash_payment',
            'card_payment',
            'bank_transfer_payment',
            'top_up'
          )
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

-- Verification (paste into Supabase SQL editor after migration):
-- SELECT unnest(enum_range(NULL::payment_method)) AS payment_method;
-- SELECT unnest(enum_range(NULL::transaction_type)) AS transaction_type;
