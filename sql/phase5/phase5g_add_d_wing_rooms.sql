-- =============================================================
-- WOOF Phase 5g (Step 2a) — Add D4, D5, D10, D11 to rooms table
-- =============================================================
-- Purely additive: 4 new rooms with the same pattern as your existing
-- D-wing rooms (wing='back_kennels', room_type='kennels').
-- All existing rooms untouched. Safe to run anytime.
-- =============================================================

BEGIN;

-- Pre-check: confirm none of these already exist (script is idempotent regardless)
SELECT 'PRE-CHECK: existing D-wing rooms' AS info;
SELECT room_number, source_external_id, wing, room_type::text
FROM rooms
WHERE room_number IN ('D4','D5','D10','D11')
   OR source_external_id IN ('ROOM-D4','ROOM-D5','ROOM-D10','ROOM-D11');

-- Insert (idempotent via NOT EXISTS)
-- Note: rooms table in Woof has no branch_id column (no branches table).
-- display_name is NOT NULL — set to room_number same as existing D-wing rows.
INSERT INTO rooms (source_external_id, room_number, name, display_name, wing, room_type, is_active)
SELECT 'ROOM-' || v.rn, v.rn, v.rn, v.rn, 'back_kennels', 'kennels'::room_type, true
FROM (VALUES ('D4'),('D5'),('D10'),('D11')) AS v(rn)
WHERE NOT EXISTS (
  SELECT 1 FROM rooms r
  WHERE r.source_external_id = 'ROOM-' || v.rn OR r.room_number = v.rn
);
-- capacity_type, max_pets, pet_type use table defaults (single / 1 / dog)

-- Post-check: D-wing should now have 13 rooms (D1–D13)
SELECT 'POST-CHECK: D-wing rooms after insert' AS info;
SELECT room_number, source_external_id, wing, room_type::text, is_active
FROM rooms
WHERE wing = 'back_kennels' AND room_number ~ '^D\d+$'
ORDER BY substring(room_number FROM '\d+')::int;

-- Expected: 13 rows, D1 through D13, all active, all back_kennels/kennels
COMMIT;
