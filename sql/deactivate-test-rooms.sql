-- Deactivate Vitest/Playwright rooms leaked into production (duplicate A16/B2 rows, etc.).
-- Run in Supabase SQL editor, then paste the verification SELECT results.

UPDATE public.rooms
SET is_active = false
WHERE room_number ~* '^TEST_'
   OR display_name ~* '^TEST_';

-- Verification (expect active_test_rooms = 0 after apply):
SELECT
  COUNT(*) FILTER (WHERE is_active AND room_number ~* '^TEST_') AS active_test_rooms,
  COUNT(*) FILTER (WHERE room_number ~* '^TEST_') AS total_test_rooms,
  COUNT(*) FILTER (WHERE is_active AND UPPER(TRIM(room_number)) IN ('F100', 'D100')) AS active_f100_d100;
