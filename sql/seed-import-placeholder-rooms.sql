-- Import placeholder rooms — one row per suite tier for PetExec backfill until a real kennel is assigned.
-- Run in Supabase SQL Editor (Step 1: enum, Step 2: inserts).

ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'import_placeholder';

-- Dog tiers (wing = import_placeholder, not cattery)
INSERT INTO public.rooms (
  display_name, room_number, wing, room_type, capacity_type, max_pets,
  is_active, pricing_category, notes, camera_recording
)
SELECT v.display_name, v.room_number, 'import_placeholder'::public.room_wing,
  v.room_type::public.room_type, 'single'::public.capacity_type, 4,
  true, v.pricing_category,
  'import_placeholder_tier=' || v.pricing_category || '; PetExec import — assign real room',
  false
FROM (VALUES
  ('Unknown · Standard', 'UNK-STD', 'standard', 'standard', 'standard'),
  ('Unknown · Deluxe', 'UNK-DLX', 'deluxe', 'deluxe', 'deluxe'),
  ('Unknown · Royal', 'UNK-ROY', 'royal_suite_single', 'royal', 'royal'),
  ('Unknown · Presidential', 'UNK-PRES', 'presidential_single', 'presidential', 'presidential'),
  ('Unknown · Family', 'UNK-FAM', 'family_room', 'family', 'family'),
  ('Unknown · Tier not set', 'UNK-NA-DOG', 'standard', 'standard', 'unknown')
) AS v(display_name, room_number, room_type, pricing_category, tier_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.wing = 'import_placeholder'::public.room_wing AND r.room_number = v.room_number
);

-- Cat tiers (still import_placeholder wing; calendar filters by tier / species on bookings)
INSERT INTO public.rooms (
  display_name, room_number, wing, room_type, capacity_type, max_pets,
  is_active, pricing_category, notes, camera_recording
)
SELECT v.display_name, v.room_number, 'import_placeholder'::public.room_wing,
  v.room_type::public.room_type, 'single'::public.capacity_type, 3,
  true, v.pricing_category,
  'import_placeholder_tier=' || v.pricing_category || '; species=cat; PetExec import',
  false
FROM (VALUES
  ('Unknown · Cat Deluxe', 'UNK-CAT-DLX', 'cattery_deluxe', 'cattery_deluxe'),
  ('Unknown · Cat Presidential', 'UNK-CAT-PRES', 'cattery_presidential', 'cattery_presidential'),
  ('Unknown · Cat Super Presidential', 'UNK-CAT-SUPER', 'cattery_super_presidential', 'cattery_super_presidential'),
  ('Unknown · Cat tier not set', 'UNK-CAT-NA', 'cattery_deluxe', 'unknown')
) AS v(display_name, room_number, room_type, pricing_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r
  WHERE r.room_number = v.room_number
);
