-- Rooms inventory: columns, enums, and Bond / Dluxe / Standard seed data
-- PostgreSQL 15+ (uses ADD VALUE IF NOT EXISTS on enums).
-- Safe to re-run: inserts use NOT EXISTS guards; optional UPDATEs normalize legacy names.

-- ── Columns ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS camera_recording boolean NOT NULL DEFAULT false;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_number text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.rooms.room_number IS 'Human-visible room number within wing/type (string for flexibility).';
COMMENT ON COLUMN public.rooms.camera_recording IS 'Whether this room has camera recording enabled.';

-- ── Enum values (no-op if already present) ─────────────────────────────────────
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'bond_rooms';
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'dluxe';
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'standard_room';

ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'single_royal';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'double_royal';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'park_lane';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'kennels';

-- Normalize legacy seed labels → display names requested for Back Kennels rows
UPDATE public.rooms
SET display_name = 'Back Kennels ' || trim(room_number)
WHERE wing = 'dluxe'::public.room_wing
  AND room_type = 'kennels'::public.room_type
  AND display_name LIKE 'Dluxe Back Kennels %';

UPDATE public.rooms
SET display_name = 'Back Kennels ' || trim(room_number)
WHERE wing = 'standard_room'::public.room_wing
  AND room_type = 'kennels'::public.room_type
  AND display_name LIKE 'Standard Back Kennels %';

-- ── Bond Suites (Single Royal x14, Double Royal x4) ─────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Bond Suite ' || n,
  'bond_rooms'::public.room_wing,
  CASE WHEN n <= 14 THEN 'single_royal'::public.room_type ELSE 'double_royal'::public.room_type END,
  CASE WHEN n <= 14 THEN 'single'::public.capacity_type ELSE 'multiple'::public.capacity_type END,
  CASE WHEN n <= 14 THEN 1 ELSE 2 END,
  n::text,
  true,
  false
FROM generate_series(1, 18) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'bond_rooms'::public.room_wing
    AND r.room_number = n::text
);

-- ── Dluxe: Park Lane 5–7 ────────────────────────────────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Park Lane ' || n,
  'dluxe'::public.room_wing,
  'park_lane'::public.room_type,
  'single'::public.capacity_type,
  1,
  n::text,
  true,
  false
FROM generate_series(5, 7) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'dluxe'::public.room_wing
    AND r.room_type = 'park_lane'::public.room_type
    AND r.room_number = n::text
);

-- ── Dluxe: Pall Mall 1–3 ────────────────────────────────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Pall Mall ' || n,
  'dluxe'::public.room_wing,
  'pall_mall'::public.room_type,
  'single'::public.capacity_type,
  1,
  n::text,
  true,
  false
FROM generate_series(1, 3) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'dluxe'::public.room_wing
    AND r.room_type = 'pall_mall'::public.room_type
    AND r.room_number = n::text
);

-- ── Dluxe: Back Kennels 1–33 (display: Back Kennels N; wing disambiguates vs Standard)
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Back Kennels ' || n,
  'dluxe'::public.room_wing,
  'kennels'::public.room_type,
  'single'::public.capacity_type,
  1,
  n::text,
  true,
  false
FROM generate_series(1, 33) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'dluxe'::public.room_wing
    AND r.room_type = 'kennels'::public.room_type
    AND r.room_number = n::text
);

-- ── Standard Room: Pall Mall 4–8 ────────────────────────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Pall Mall ' || n,
  'standard_room'::public.room_wing,
  'pall_mall'::public.room_type,
  'single'::public.capacity_type,
  1,
  n::text,
  true,
  false
FROM generate_series(4, 8) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'standard_room'::public.room_wing
    AND r.room_type = 'pall_mall'::public.room_type
    AND r.room_number = n::text
);

-- ── Standard Room: Back Kennels 1–15 ───────────────────────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Back Kennels ' || n,
  'standard_room'::public.room_wing,
  'kennels'::public.room_type,
  'single'::public.capacity_type,
  1,
  n::text,
  true,
  false
FROM generate_series(1, 15) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'standard_room'::public.room_wing
    AND r.room_type = 'kennels'::public.room_type
    AND r.room_number = n::text
);
