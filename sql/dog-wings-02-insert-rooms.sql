-- =============================================================================
-- STEP 2 OF 2 — Run ONLY after sql/dog-wings-01-enum-extensions.sql has succeeded.
-- Inserts Bond Suite, Park Lane, Pall Mall, and Back Kennels rows (idempotent).
-- =============================================================================
-- Mapping (see src/integrations/supabase/types.ts):
--   Bond Suite      → wing bond_rooms; single_royal / double_royal
--   Park Lane       → wing dluxe; room_type park_lane
--   Pall Mall       → dluxe (1–3) | standard_room (4–8); room_type pall_mall
--   Back Kennels    → dluxe + kennels (1–33)
--   Back Kennels 2  → standard_room + kennels (1–15)

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

-- ── Pall Mall: rooms 1–8 (Dluxe 1–3; Standard 4–8) ────────────────────────────
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
