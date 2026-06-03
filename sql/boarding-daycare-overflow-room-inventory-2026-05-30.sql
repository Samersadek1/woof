-- Boarding room inventory: daycare zones + overflow expansion (2026-05-30)
-- Safe to re-run. Preserves room UUIDs (assignments stay linked).
--
-- Changes:
--   Daycare 1     — zone Daycare 1 (Daycare 1-1 … Daycare 1-4)
--   Daycare 2     — zone Daycare 2; A1–A12, B1–B8, C1–C6 (renamed from Dcare2*)
--   Daycare 3     — zone Daycare 3; Daycare 3-1 … Daycare 3-3 (was Upstairs Dcare3-*)
--   Daycare Spaces — zone Daycare Spaces; DC 1, DC 2
--   Overflow      — 20 rooms (Overflow 1 … Overflow 20)

BEGIN;

-- ── Daycare 1 ─────────────────────────────────────────────────────────────────
UPDATE public.rooms
SET zone = 'Daycare 1'
WHERE room_number IN ('Daycare 1-1', 'Daycare 1-2', 'Daycare 1-3', 'Daycare 1-4')
   OR display_name IN ('Daycare 1-1', 'Daycare 1-2', 'Daycare 1-3', 'Daycare 1-4');

-- ── Daycare 2 (Dcare2* → A/B/C grid) ────────────────────────────────────────
UPDATE public.rooms r
SET
  room_number = m.new_label,
  display_name = m.new_label,
  name = m.new_label,
  zone = 'Daycare 2',
  size_class = 'standard'::public.room_size_class
FROM (
  VALUES
    ('Dcare2a1', 'A1'), ('Dcare2a2', 'A2'), ('Dcare2a3', 'A3'), ('Dcare2a4', 'A4'),
    ('Dcare2a5', 'A5'), ('Dcare2a6', 'A6'), ('Dcare2a7', 'A7'), ('Dcare2a8', 'A8'),
    ('Dcare2a9', 'A9'), ('Dcare2a10', 'A10'), ('Dcare2a11', 'A11'), ('Dcare2a12', 'A12'),
    ('Dcare2b1', 'B1'), ('Dcare2b2', 'B2'), ('Dcare2b3', 'B3'), ('Dcare2b4', 'B4'),
    ('Dcare2b5', 'B5'), ('Dcare2b6ES', 'B6'),
    ('Dcare2c7', 'B7'), ('Dcare2c8', 'B8'),
    ('Dcare2c1', 'C1'), ('Dcare2c2ES', 'C2'), ('Dcare2c3', 'C3'), ('Dcare2c4', 'C4'),
    ('Dcare2c5', 'C5'), ('Dcare2c6', 'C6')
) AS m(old_label, new_label)
WHERE r.room_number = m.old_label
   OR r.display_name = m.old_label;

-- ── Daycare 3 (replaces upstairs daycare) ─────────────────────────────────────
UPDATE public.rooms
SET
  room_number = CASE room_number
    WHEN 'Upstairs Dcare3-1' THEN 'Daycare 3-1'
    WHEN 'Upstairs Dcare3-2' THEN 'Daycare 3-2'
    WHEN 'Upstairs Dcare3-3' THEN 'Daycare 3-3'
    ELSE room_number
  END,
  display_name = CASE display_name
    WHEN 'Upstairs Dcare3-1' THEN 'Daycare 3-1'
    WHEN 'Upstairs Dcare3-2' THEN 'Daycare 3-2'
    WHEN 'Upstairs Dcare3-3' THEN 'Daycare 3-3'
    ELSE display_name
  END,
  name = CASE name
    WHEN 'Upstairs Dcare3-1' THEN 'Daycare 3-1'
    WHEN 'Upstairs Dcare3-2' THEN 'Daycare 3-2'
    WHEN 'Upstairs Dcare3-3' THEN 'Daycare 3-3'
    ELSE name
  END,
  zone = 'Daycare 3',
  size_class = 'standard'::public.room_size_class
WHERE room_number IN ('Upstairs Dcare3-1', 'Upstairs Dcare3-2', 'Upstairs Dcare3-3')
   OR display_name IN ('Upstairs Dcare3-1', 'Upstairs Dcare3-2', 'Upstairs Dcare3-3');

-- ── Daycare Spaces ────────────────────────────────────────────────────────────
UPDATE public.rooms
SET
  room_number = CASE room_number
    WHEN 'Dcare Spaces 1' THEN 'DC 1'
    WHEN 'Dcare Spaces 2' THEN 'DC 2'
    ELSE room_number
  END,
  display_name = CASE display_name
    WHEN 'Dcare Spaces 1' THEN 'DC 1'
    WHEN 'Dcare Spaces 2' THEN 'DC 2'
    ELSE display_name
  END,
  name = CASE name
    WHEN 'Dcare Spaces 1' THEN 'DC 1'
    WHEN 'Dcare Spaces 2' THEN 'DC 2'
    ELSE name
  END,
  zone = 'Daycare Spaces',
  size_class = 'standard'::public.room_size_class
WHERE room_number IN ('Dcare Spaces 1', 'Dcare Spaces 2')
   OR display_name IN ('Dcare Spaces 1', 'Dcare Spaces 2');

-- ── Overflow 1–20 ─────────────────────────────────────────────────────────────
UPDATE public.rooms
SET zone = 'Overflow',
    size_class = 'standard'::public.room_size_class
WHERE room_number LIKE 'Overflow %'
   OR display_name LIKE 'Overflow %';

INSERT INTO public.rooms (
  display_name, name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording, pet_type, zone, size_class
)
SELECT
  'Overflow ' || n,
  'Overflow ' || n,
  'back_kennels'::public.room_wing,
  'kennels'::public.room_type,
  'single'::public.capacity_type,
  99,
  'Overflow ' || n,
  true,
  false,
  'dog',
  'Overflow',
  'standard'::public.room_size_class
FROM generate_series(9, 20) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.room_number = 'Overflow ' || n
);

COMMIT;

-- Re-classify size_class after renames
SELECT public.woof_backfill_room_size_class();

-- ── Verification ──────────────────────────────────────────────────────────────
SELECT zone, count(*)::int AS room_count
FROM public.rooms
WHERE zone IN ('Daycare 1', 'Daycare 2', 'Daycare 3', 'Daycare Spaces', 'Overflow')
   OR display_name ILIKE 'Daycare%'
   OR display_name ILIKE 'DC %'
   OR display_name ILIKE 'Overflow%'
GROUP BY zone
ORDER BY zone;

SELECT room_number, display_name, zone
FROM public.rooms
WHERE zone = 'Daycare 2'
ORDER BY
  left(room_number, 1),
  nullif(regexp_replace(room_number, '^[^0-9]*', ''), '')::int;
