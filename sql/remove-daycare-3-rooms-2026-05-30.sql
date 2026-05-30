-- Retire Daycare 3 zone: reassign lone historical stay, deactivate rooms.
-- Safe to re-run (idempotent where noted).

BEGIN;

-- Reassign WOOF-2026-00650 (Harvey / Dayana Shevarkova) off Daycare 3-1 → A17
UPDATE public.booking_room_assignments bra
SET room_id = target.id
FROM public.rooms target
WHERE target.id = 'd336ec0c-436b-49cf-b82f-329287c16c56'
  AND target.room_number = 'A17'
  AND bra.id = (
    SELECT bra2.id
    FROM public.booking_room_assignments bra2
    JOIN public.rooms r ON r.id = bra2.room_id
    JOIN public.bookings b ON b.id = bra2.booking_id
    WHERE r.zone = 'Daycare 3'
      AND b.booking_ref = 'WOOF-2026-00650'
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1
    FROM public.booking_room_assignments bra3
    JOIN public.rooms r3 ON r3.id = bra3.room_id
    WHERE bra3.id = bra.id
      AND r3.zone = 'Daycare 3'
  );

-- Hide from kennel map / capacity pool
UPDATE public.rooms
SET
  is_active = false,
  size_class = NULL
WHERE zone = 'Daycare 3';

COMMIT;

-- Verification
SELECT 'daycare3_active_rooms' AS check, count(*)::int AS n
FROM public.rooms
WHERE zone = 'Daycare 3' AND is_active = true

UNION ALL

SELECT 'assignments_on_daycare3', count(*)::int
FROM public.booking_room_assignments bra
JOIN public.rooms r ON r.id = bra.room_id
WHERE r.zone = 'Daycare 3'

UNION ALL

SELECT 'woof_650_room' AS check, r.room_number AS n
FROM public.booking_room_assignments bra
JOIN public.bookings b ON b.id = bra.booking_id
JOIN public.rooms r ON r.id = bra.room_id
WHERE b.booking_ref = 'WOOF-2026-00650' AND r.room_number = 'A17';
