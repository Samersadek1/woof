-- Seed UNK-* placeholder rooms (run after enum migration is committed).

INSERT INTO public.rooms (
  display_name, room_number, wing, room_type, capacity_type, max_pets,
  is_active, pricing_category, notes, camera_recording
)
SELECT v.display_name, v.room_number, 'import_placeholder'::public.room_wing,
  v.room_type::public.room_type, 'single'::public.capacity_type, v.max_pets,
  true, v.pricing_category, v.notes, false
FROM (VALUES
  ('Unknown · Standard', 'UNK-STD', 'standard'::public.room_type, 'standard', 4, 'import_placeholder_tier=standard; PetExec import — assign real room'),
  ('Unknown · Deluxe', 'UNK-DLX', 'deluxe'::public.room_type, 'deluxe', 4, 'import_placeholder_tier=deluxe; PetExec import'),
  ('Unknown · Royal', 'UNK-ROY', 'royal_suite_single'::public.room_type, 'royal', 4, 'import_placeholder_tier=royal; PetExec import'),
  ('Unknown · Presidential', 'UNK-PRES', 'presidential_single'::public.room_type, 'presidential', 4, 'import_placeholder_tier=presidential; PetExec import'),
  ('Unknown · Family', 'UNK-FAM', 'family_room'::public.room_type, 'family', 4, 'import_placeholder_tier=family; PetExec import'),
  ('Unknown · Tier not set', 'UNK-NA-DOG', 'standard'::public.room_type, 'unknown', 4, 'import_placeholder_tier=unknown; PetExec import'),
  ('Unknown · Cat Deluxe', 'UNK-CAT-DLX', 'cattery_deluxe'::public.room_type, 'cattery_deluxe', 3, 'import_placeholder_tier=cattery_deluxe; species=cat; PetExec import'),
  ('Unknown · Cat Presidential', 'UNK-CAT-PRES', 'cattery_presidential'::public.room_type, 'cattery_presidential', 3, 'import_placeholder_tier=cattery_presidential; species=cat; PetExec import'),
  ('Unknown · Cat Super Presidential', 'UNK-CAT-SUPER', 'cattery_super_presidential'::public.room_type, 'cattery_super_presidential', 3, 'import_placeholder_tier=cattery_super_presidential; species=cat; PetExec import'),
  ('Unknown · Cat tier not set', 'UNK-CAT-NA', 'cattery_deluxe'::public.room_type, 'unknown', 3, 'import_placeholder_tier=unknown; species=cat; PetExec import')
) AS v(display_name, room_number, room_type, pricing_category, max_pets, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r WHERE r.room_number = v.room_number
);
