-- Kennel map 2026-06-01: remove stale assignment segments (ghost slots).
-- Run in Supabase SQL editor. Idempotent where noted.

-- Phoebie: checked out 2026-05-28; remove post-stay segments
DELETE FROM public.booking_room_assignments bra
USING public.bookings b
WHERE bra.booking_id = b.id
  AND b.booking_ref = 'WOOF-2026-00639'
  AND bra.start_date > (b.check_out_date - 1);

-- Rocky: check-in moved to 2026-06-29; remove pre-stay segments
DELETE FROM public.booking_room_assignments bra
USING public.bookings b
WHERE bra.booking_id = b.id
  AND b.booking_ref = 'WOOF-2026-00798'
  AND bra.end_date < b.check_in_date;

-- Cancelled stays: remove assignment segments (e.g. Bruno B5, duplicate Pepsi B6)
DELETE FROM public.booking_room_assignments bra
USING public.bookings b
WHERE bra.booking_id = b.id
  AND b.booking_type = 'boarding'
  AND b.status = 'cancelled';

-- Verification: ghost assignments on 2026-06-01 (should return 0 rows)
SELECT b.booking_ref, p.name, r.room_number, b.status, b.check_in_date, b.check_out_date
FROM public.booking_room_assignments bra
JOIN public.bookings b ON b.id = bra.booking_id
JOIN public.booking_pets bp ON bp.booking_id = b.id
JOIN public.pets p ON p.id = bp.pet_id
JOIN public.rooms r ON r.id = bra.room_id
WHERE bra.start_date <= '2026-06-01' AND bra.end_date >= '2026-06-01'
  AND NOT (
    b.booking_type = 'boarding'
    AND b.status IN ('confirmed', 'checked_in')
    AND b.check_in_date <= '2026-06-01'
    AND '2026-06-01' < b.check_out_date
  );
