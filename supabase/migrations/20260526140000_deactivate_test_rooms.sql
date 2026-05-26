-- Deactivate Vitest/Playwright rooms (room_number like TEST_<scope>_A16).
-- Safe to re-run; does not delete rows (preserves audit/history if any FKs appear later).

UPDATE public.rooms
SET is_active = false
WHERE room_number ~* '^TEST_'
   OR display_name ~* '^TEST_';
