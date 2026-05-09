-- Rooms: camera_recording, enum extensions, seed Bond / Dluxe / Standard inventory
-- Run against Supabase Postgres (PG15+). Safe to re-run: inserts are guarded.

-- ── Columns ───────────────────────────────────────────────────────────────────
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS camera_recording boolean NOT NULL DEFAULT false;

-- room_number is expected by the app; add only if an older DB lacked it.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_number text NOT NULL DEFAULT '';

-- ── Enums (IF NOT EXISTS requires PostgreSQL 15+) ─────────────────────────────
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'bond_rooms';
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'dluxe';
ALTER TYPE room_wing ADD VALUE IF NOT EXISTS 'standard_room';

ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'park_lane';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'kennels';

-- ── Bond Suites (Single Royal x14, Double Royal x4) ───────────────────────────
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
  WHERE r.wing = 'bond_rooms'::public.room_wing AND r.room_number = n::text
);

-- ── Dluxe: Park Lane 5–7 ───────────────────────────────────────────────────────
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

-- ── Dluxe: Pall Mall 1–3 ───────────────────────────────────────────────────────
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

-- ── Dluxe: Back Kennels 1–33 (unique display names vs Standard wing) ─────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Dluxe Back Kennels ' || n,
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

-- ── Standard Room: Pall Mall 4–8 ───────────────────────────────────────────────
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

-- ── Standard Room: Back Kennels 1–15 ───────────────────────────────────────────
INSERT INTO public.rooms (
  display_name, wing, room_type, capacity_type, max_pets, room_number,
  is_active, camera_recording
)
SELECT
  'Standard Back Kennels ' || n,
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
