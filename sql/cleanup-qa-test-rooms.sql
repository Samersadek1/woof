-- Safe cleanup for Vitest/Playwright room rows on woof Supabase.
-- Step 1: deactivate (no FK breakage). Step 2: delete only inactive rows with no references.
-- Run in Supabase SQL editor; paste verification SELECT results back.

UPDATE public.rooms
SET is_active = false
WHERE is_active
  AND (room_number ~* '^TEST_' OR display_name ~* '^TEST_');

DELETE FROM public.rooms r
WHERE NOT r.is_active
  AND (r.room_number ~* '^TEST_' OR r.display_name ~* '^TEST_')
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.room_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.booking_room_assignments bra WHERE bra.room_id = r.id);

-- Verification (expect all zeros):
SELECT
  COUNT(*) FILTER (WHERE is_active AND (room_number ~* 'TEST_' OR display_name ~* 'TEST_')) AS active_test_rooms,
  COUNT(*) FILTER (WHERE room_number ~* 'TEST_' OR display_name ~* 'TEST_') AS total_test_rooms,
  COUNT(*) FILTER (WHERE is_active AND UPPER(TRIM(room_number)) IN ('F100', 'D100', 'A100')) AS active_short_code_leaks;
