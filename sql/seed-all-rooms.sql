-- =============================================================================
-- SEED ALL FACILITY ROOMS
-- Run in Supabase SQL Editor in TWO steps:
--   STEP 1: Run only the ALTER TYPE block below (enum values must commit first).
--   STEP 2: Run the rest (INSERT statements) after Step 1 succeeds.
-- All inserts are idempotent (guarded with NOT EXISTS on wing + room_number).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1 — ENUM EXTENSIONS (run this first, then commit)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── New wing values ──────────────────────────────────────────────────────────
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'bond_suite';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'royal_annex';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'royal_suite';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'little_gems';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'standard_suite';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'grooming_room';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'training_room';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'deluxe_annex';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'deluxe_suite';

-- ── New room_type values ─────────────────────────────────────────────────────
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'presidential_single';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'presidential_double';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'royal_suite_single';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'royal_suite_double';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'deluxe';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'standard';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'standard_glass';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'single_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'double_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'family_room';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_deluxe';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_standard';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_presidential';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_presidential_double';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_royal_double';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_standard_luxury';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'lg_resting_nook';

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2 — INSERT ALL ROOMS (run after enums are committed)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Oxford Street: rooms 1-8, Presidential types ─────────────────────────────
-- Rooms 1-4: presidential_single, max 2
-- Rooms 5-8: presidential_double, max 4
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Oxford Street ' || n,
  n::text,
  'oxford'::public.room_wing,
  CASE WHEN n <= 4 THEN 'presidential_single'::public.room_type ELSE 'presidential_double'::public.room_type END,
  CASE WHEN n <= 4 THEN 'multiple'::public.capacity_type ELSE 'multiple'::public.capacity_type END,
  CASE WHEN n <= 4 THEN 2 ELSE 4 END,
  true,
  false
FROM generate_series(1, 8) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'oxford'::public.room_wing AND r.room_number = n::text
);

-- ── Piccadilly: rooms 1-7, Royal Suite types ─────────────────────────────────
-- Rooms 1-5: royal_suite_single, max 1
-- Rooms 6-7: royal_suite_double, max 2
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Piccadilly ' || n,
  n::text,
  'piccadilly'::public.room_wing,
  CASE WHEN n <= 5 THEN 'royal_suite_single'::public.room_type ELSE 'royal_suite_double'::public.room_type END,
  CASE WHEN n <= 5 THEN 'single'::public.capacity_type ELSE 'multiple'::public.capacity_type END,
  CASE WHEN n <= 5 THEN 1 ELSE 2 END,
  true,
  false
FROM generate_series(1, 7) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'piccadilly'::public.room_wing AND r.room_number = n::text
);

-- ── Park Lane: rooms 1-7, Royal Suite and Deluxe types ───────────────────────
-- Rooms 1-4: deluxe, max 2
-- Rooms 5-7: royal_suite_single, max 2
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Park Lane ' || n,
  n::text,
  'park_lane'::public.room_wing,
  CASE WHEN n <= 4 THEN 'deluxe'::public.room_type ELSE 'royal_suite_single'::public.room_type END,
  'multiple'::public.capacity_type,
  2,
  true,
  false
FROM generate_series(1, 7) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'park_lane'::public.room_wing AND r.room_number = n::text
);

-- ── Fleet: rooms 1-6, Single/Double Royal types ──────────────────────────────
-- Rooms 1-4: single_royal, max 1
-- Rooms 5-6: double_royal, max 2
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Fleet ' || n,
  n::text,
  'fleet'::public.room_wing,
  CASE WHEN n <= 4 THEN 'single_royal'::public.room_type ELSE 'double_royal'::public.room_type END,
  CASE WHEN n <= 4 THEN 'single'::public.capacity_type ELSE 'multiple'::public.capacity_type END,
  CASE WHEN n <= 4 THEN 1 ELSE 2 END,
  true,
  false
FROM generate_series(1, 6) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'fleet'::public.room_wing AND r.room_number = n::text
);

-- ── Royal Annex: rooms 21-24, Royal Suite, max 2 ─────────────────────────────
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Royal Annex ' || n,
  n::text,
  'royal_annex'::public.room_wing,
  'royal_suite_single'::public.room_type,
  'multiple'::public.capacity_type,
  2,
  true,
  false
FROM generate_series(21, 24) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'royal_annex'::public.room_wing AND r.room_number = n::text
);

-- ── Royal Suite: rooms 1-20, Royal Suite types, max 2 ────────────────────────
-- Rooms 1-14: royal_suite_single, max 2
-- Rooms 15-20: royal_suite_double, max 2
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Royal Suite ' || n,
  n::text,
  'royal_suite'::public.room_wing,
  CASE WHEN n <= 14 THEN 'royal_suite_single'::public.room_type ELSE 'royal_suite_double'::public.room_type END,
  'multiple'::public.capacity_type,
  2,
  true,
  false
FROM generate_series(1, 20) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'royal_suite'::public.room_wing AND r.room_number = n::text
);

-- ── Bond Suite: rooms 1-18, Single/Double Royal types ────────────────────────
-- Rooms 1-14: single_royal, max 1
-- Rooms 15-18: double_royal, max 2
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Bond Suite ' || n,
  n::text,
  'bond_suite'::public.room_wing,
  CASE WHEN n <= 14 THEN 'single_royal'::public.room_type ELSE 'double_royal'::public.room_type END,
  CASE WHEN n <= 14 THEN 'single'::public.capacity_type ELSE 'multiple'::public.capacity_type END,
  CASE WHEN n <= 14 THEN 1 ELSE 2 END,
  true,
  false
FROM generate_series(1, 18) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'bond_suite'::public.room_wing AND r.room_number = n::text
);

-- ── Little Gems: rooms 1-67, LG types ────────────────────────────────────────
-- 1-8:   lg_presidential, max 2
-- 9-14:  lg_presidential_double, max 2
-- 15-24: lg_royal, max 1
-- 25-30: lg_royal_double, max 2
-- 31-42: lg_deluxe, max 1
-- 43-54: lg_standard, max 1
-- 55-60: lg_standard_luxury, max 1
-- 61-67: lg_resting_nook, max 1
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Little Gems ' || n,
  n::text,
  'little_gems'::public.room_wing,
  CASE
    WHEN n BETWEEN 1  AND 8  THEN 'lg_presidential'::public.room_type
    WHEN n BETWEEN 9  AND 14 THEN 'lg_presidential_double'::public.room_type
    WHEN n BETWEEN 15 AND 24 THEN 'lg_royal'::public.room_type
    WHEN n BETWEEN 25 AND 30 THEN 'lg_royal_double'::public.room_type
    WHEN n BETWEEN 31 AND 42 THEN 'lg_deluxe'::public.room_type
    WHEN n BETWEEN 43 AND 54 THEN 'lg_standard'::public.room_type
    WHEN n BETWEEN 55 AND 60 THEN 'lg_standard_luxury'::public.room_type
    WHEN n BETWEEN 61 AND 67 THEN 'lg_resting_nook'::public.room_type
  END,
  CASE
    WHEN n BETWEEN 1  AND 14 THEN 'multiple'::public.capacity_type
    WHEN n BETWEEN 25 AND 30 THEN 'multiple'::public.capacity_type
    ELSE 'single'::public.capacity_type
  END,
  CASE
    WHEN n BETWEEN 1  AND 14 THEN 2
    WHEN n BETWEEN 25 AND 30 THEN 2
    ELSE 1
  END,
  true,
  false
FROM generate_series(1, 67) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'little_gems'::public.room_wing AND r.room_number = n::text
);

-- ── Deluxe Suite: rooms 1-28, Deluxe type, max 2 ────────────────────────────
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Deluxe Suite ' || n,
  n::text,
  'deluxe_suite'::public.room_wing,
  'deluxe'::public.room_type,
  'multiple'::public.capacity_type,
  2,
  true,
  false
FROM generate_series(1, 28) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'deluxe_suite'::public.room_wing AND r.room_number = n::text
);

-- ── Standard Suite: rooms 1-15, Standard type, max 1 ─────────────────────────
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Standard Suite ' || n,
  n::text,
  'standard_suite'::public.room_wing,
  'standard'::public.room_type,
  'single'::public.capacity_type,
  1,
  true,
  false
FROM generate_series(1, 15) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'standard_suite'::public.room_wing AND r.room_number = n::text
);

-- ── Pall Mall: rooms 1-8, Deluxe and Standard-Glass types ───────────────────
-- Rooms 1-3: deluxe
-- Rooms 4-8: standard_glass
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Pall Mall ' || n,
  n::text,
  'pall_mall'::public.room_wing,
  CASE WHEN n <= 3 THEN 'deluxe'::public.room_type ELSE 'standard_glass'::public.room_type END,
  'single'::public.capacity_type,
  1,
  true,
  false
FROM generate_series(1, 8) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'pall_mall'::public.room_wing AND r.room_number = n::text
);

-- ── Grooming Rooms: 25-27 Royal, 34-36 Deluxe ───────────────────────────────
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Grooming Room ' || n,
  n::text,
  'grooming_room'::public.room_wing,
  'single_royal'::public.room_type,
  'single'::public.capacity_type,
  1,
  true,
  false
FROM generate_series(25, 27) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'grooming_room'::public.room_wing AND r.room_number = n::text
);

INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Grooming Room ' || n,
  n::text,
  'grooming_room'::public.room_wing,
  'deluxe'::public.room_type,
  'single'::public.capacity_type,
  1,
  true,
  false
FROM generate_series(34, 36) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'grooming_room'::public.room_wing AND r.room_number = n::text
);

-- ── Training Rooms: rooms 28-37, Royal type ──────────────────────────────────
INSERT INTO public.rooms (display_name, room_number, wing, room_type, capacity_type, max_pets, is_active, camera_recording)
SELECT
  'Training Room ' || n,
  n::text,
  'training_room'::public.room_wing,
  'single_royal'::public.room_type,
  'single'::public.capacity_type,
  1,
  true,
  false
FROM generate_series(28, 37) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'training_room'::public.room_wing AND r.room_number = n::text
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — Total rooms inserted: up to 232 (idempotent, skips existing)
-- Oxford Street (8) + Piccadilly (7) + Park Lane (7) + Fleet (6) +
-- Royal Annex (4) + Royal Suite (20) + Bond Suite (18) + Little Gems (67) +
-- Deluxe Suite (28) + Standard Suite (15) + Pall Mall (8) +
-- Grooming Rooms (6) + Training Rooms (10) = 204 new rooms
-- ═══════════════════════════════════════════════════════════════════════════════
