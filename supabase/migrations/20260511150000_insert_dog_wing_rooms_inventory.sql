-- Insert dog boarding wing inventory (idempotent).
--
-- Base deployments often only have legacy room_wing values (oxford, piccadilly, park_lane,
-- fleet, back_kennels, …). The admin app uses additional wings; extend enums before INSERT.
-- IF NOT EXISTS requires PostgreSQL 15+ (Supabase default).
--
-- Human label       → public.room_wing value   (see src/integrations/supabase/types.ts)
--   Bond Suite      → bond_rooms
--   Park Lane block   → dluxe  (room_type = park_lane distinguishes from Pall Mall / Kennels)
--   Pall Mall block   → dluxe (rooms 1–3) | standard_room (rooms 4–8); room_type = pall_mall
--   Back Kennels      → dluxe + room_type kennels (rooms 1–33)
--   Back Kennels (2)  → standard_room + room_type kennels (rooms 1–15)

-- ── Extend enums (no-op if values already exist) ───────────────────────────────
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'bond_rooms';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'dluxe';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'standard_room';

ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'single_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'double_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'park_lane';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'kennels';

-- ── Bond Suite: 1–14 Single Royal, 15–18 Double Royal ─────────────────────────
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

-- ── Park Lane: rooms 5, 6, 7 ────────────────────────────────────────────────────
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

-- ── Pall Mall: rooms 1–8 (Dluxe block 1–3; Standard block 4–8) ────────────────
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

-- ── Back Kennels: rooms 1–33 (Dluxe wing) ─────────────────────────────────────
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

-- ── Back Kennels (second wing): rooms 1–15 (Standard wing) ────────────────────
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
