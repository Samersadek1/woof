-- Floating grooming backlog RPC (station-minute board). Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.woof_grooming_backlog(p_date date)
RETURNS TABLE (
  appt_id uuid,
  pet_id uuid,
  owner_id uuid,
  dog_name text,
  pet_size text,
  service public.grooming_service,
  duration_minutes int,
  source_booking_id uuid,
  booking_ref text
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    g.id,
    g.pet_id,
    g.owner_id,
    p.name,
    p.size::text,
    g.service,
    g.duration_minutes,
    g.booking_id,
    b.booking_ref
  FROM public.grooming_appointments g
  LEFT JOIN public.pets p ON p.id = g.pet_id
  LEFT JOIN public.bookings b ON b.id = g.booking_id
  WHERE g.appointment_date = p_date
    AND g.appointment_time IS NULL
    AND coalesce(g.status, '') <> 'cancelled'
    AND coalesce(g.no_show, false) = false
  ORDER BY p.name NULLS LAST, g.service;
$$;

GRANT EXECUTE ON FUNCTION public.woof_grooming_backlog(date) TO authenticated, service_role;

COMMIT;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname LIKE 'woof_grooming%' ORDER BY 1;
-- SELECT count(*) FROM public.woof_grooming_backlog(current_date);
