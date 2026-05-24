-- Phase 5b — fix B2 wing (import_placeholder → back_kennels)

-- VERIFY
SELECT wing, COUNT(*)
FROM rooms
WHERE room_number LIKE 'B%' OR source_external_id LIKE 'ROOM-B%'
GROUP BY wing
ORDER BY COUNT(*) DESC;

BEGIN;

UPDATE rooms
SET wing = 'back_kennels'
WHERE (room_number = 'B2' OR source_external_id = 'ROOM-B2')
  AND wing = 'import_placeholder';

-- POST-CHECK
SELECT id, room_number, wing, room_type
FROM rooms
WHERE room_number = 'B2' OR source_external_id = 'ROOM-B2';

COMMIT;
