-- =============================================================================
-- MSH Room -> Price Type Mapping (v2)
-- Effective 2026-04-01
--
-- Rule:
-- - "Royal"        -> pricing_category = 'royal'
-- - "Presidential" -> pricing_category = 'presidential'
-- - "Double"       -> pricing_size_tier = 'double'
-- - "Single"       -> pricing_size_tier = 'single'
-- No reinterpretation of source facility labels.
--
-- Repository schema note:
-- This project uses `rooms.display_name`, `rooms.room_number`, and `rooms.is_active`
-- (not `name` / `active`).
-- =============================================================================

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS pricing_category TEXT,
  ADD COLUMN IF NOT EXISTS pricing_size_tier TEXT;

-- Allowed values (app convention):
--   pricing_category:  standard | deluxe | royal | presidential |
--                      little_gems_chalet | little_gems_community | family |
--                      cattery_deluxe | cattery_presidential | cattery_super_presidential
--   pricing_size_tier: single | double | triple | family

-- Reset mapped values before applying fresh mapping
UPDATE rooms
SET pricing_category = NULL,
    pricing_size_tier = NULL;

-- Helper matching rule:
-- Prefer display_name matching; fallback to room_number where needed.

-- ─── WING 01 — OXFORD STREET (Presidential) ─────────────────────────────────
UPDATE rooms
SET pricing_category = 'presidential', pricing_size_tier = 'single'
WHERE display_name IN ('Oxford 1', 'Oxford 3', 'Oxford 6')
   OR room_number  IN ('Oxford 1', 'Oxford 3', 'Oxford 6');

UPDATE rooms
SET pricing_category = 'presidential', pricing_size_tier = 'double'
WHERE display_name IN ('Oxford 2', 'Oxford 4', 'Oxford 5', 'Oxford 7', 'Oxford 8')
   OR room_number  IN ('Oxford 2', 'Oxford 4', 'Oxford 5', 'Oxford 7', 'Oxford 8');

-- ─── WING 01 — PICCADILLY (Royal) ───────────────────────────────────────────
UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'double'
WHERE display_name IN ('Piccadilly 1', 'Piccadilly 2', 'Piccadilly 3', 'Piccadilly 4')
   OR room_number  IN ('Piccadilly 1', 'Piccadilly 2', 'Piccadilly 3', 'Piccadilly 4');

UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'single'
WHERE display_name IN ('Piccadilly 5', 'Piccadilly 6', 'Piccadilly 7')
   OR room_number  IN ('Piccadilly 5', 'Piccadilly 6', 'Piccadilly 7');

-- ─── WING 01 — PARK LANE (Royal) ────────────────────────────────────────────
UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'single'
WHERE display_name IN ('Park Lane 1', 'Park Lane 2', 'Park Lane 3')
   OR room_number  IN ('Park Lane 1', 'Park Lane 2', 'Park Lane 3');

UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'double'
WHERE display_name = 'Park Lane 4'
   OR room_number  = 'Park Lane 4';

-- ─── WING 01 — FLEET STREET (Royal) ─────────────────────────────────────────
UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'double'
WHERE display_name IN ('Fleet 1', 'Fleet 2', 'Fleet 3', 'Fleet 4')
   OR room_number  IN ('Fleet 1', 'Fleet 2', 'Fleet 3', 'Fleet 4');

UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'single'
WHERE display_name IN ('Fleet 5', 'Fleet 6')
   OR room_number  IN ('Fleet 5', 'Fleet 6');

-- ─── NEW WING — BACK KENNELS ────────────────────────────────────────────────
UPDATE rooms
SET pricing_category = 'presidential', pricing_size_tier = 'double'
WHERE display_name IN ('Back Kennels 1 (Presidential)', 'Back Kennels 2 (Presidential)')
   OR room_number  IN ('Back Kennels 1 (Presidential)', 'Back Kennels 2 (Presidential)');

UPDATE rooms
SET pricing_category = 'family', pricing_size_tier = 'family'
WHERE display_name = 'Back Kennels 1 (Family Room)'
   OR room_number  = 'Back Kennels 1 (Family Room)';

-- Royal Annex -> royal (single by default)
UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'single'
WHERE display_name IN ('Back Kennels 21', 'Back Kennels 22', 'Back Kennels 23', 'Back Kennels 24')
   OR room_number  IN ('Back Kennels 21', 'Back Kennels 22', 'Back Kennels 23', 'Back Kennels 24');

UPDATE rooms
SET pricing_category = 'royal', pricing_size_tier = 'single'
WHERE display_name = 'Grooming Upstairs 21'
   OR room_number  = 'Grooming Upstairs 21';

-- ─── CATTERY ────────────────────────────────────────────────────────────────
-- Adjust WHERE clauses if your cattery room naming differs.

UPDATE rooms
SET pricing_category = 'cattery_deluxe', pricing_size_tier = 'single'
WHERE wing::text ILIKE '%cattery%'
  AND room_type::text ILIKE '%deluxe%';

UPDATE rooms
SET pricing_category = 'cattery_presidential', pricing_size_tier = 'double'
WHERE wing::text ILIKE '%cattery%'
  AND room_type::text ILIKE '%presidential%'
  AND room_type::text NOT ILIKE '%super%';

UPDATE rooms
SET pricing_category = 'cattery_super_presidential', pricing_size_tier = 'triple'
WHERE wing::text ILIKE '%cattery%'
  AND room_type::text ILIKE '%super%presidential%';

-- ─── SAFETY FALLBACKS (for any unmapped rooms) ──────────────────────────────
-- Category fallback by room_type / naming conventions
UPDATE rooms
SET pricing_category = CASE
  WHEN room_type::text = 'family_room' THEN 'family'
  WHEN room_type::text = 'cattery_deluxe' THEN 'cattery_deluxe'
  WHEN room_type::text = 'cattery_presidential' THEN 'cattery_presidential'
  WHEN room_type::text = 'cattery_super_presidential' THEN 'cattery_super_presidential'
  WHEN room_type::text ILIKE '%presidential%' THEN 'presidential'
  WHEN room_type::text ILIKE '%royal%' THEN 'royal'
  WHEN display_name ILIKE '%family%' OR room_number ILIKE '%family%' THEN 'family'
  ELSE 'standard'
END
WHERE pricing_category IS NULL;

-- Size-tier fallback from capacity + room labels
UPDATE rooms
SET pricing_size_tier = CASE
  WHEN pricing_category = 'family' THEN 'family'
  WHEN room_type::text = 'cattery_super_presidential' THEN 'triple'
  WHEN capacity_type::text = 'single' THEN 'single'
  WHEN capacity_type::text IN ('twin', 'twin_plus') THEN 'double'
  WHEN capacity_type::text = 'multiple' THEN 'triple'
  WHEN display_name ILIKE '%double%' OR room_number ILIKE '%double%' THEN 'double'
  WHEN display_name ILIKE '%single%' OR room_number ILIKE '%single%' THEN 'single'
  ELSE 'single'
END
WHERE pricing_size_tier IS NULL;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT display_name, room_number, wing, room_type, pricing_category, pricing_size_tier
-- FROM rooms
-- WHERE pricing_category IS NULL
-- ORDER BY wing, display_name, room_number;
--
-- SELECT pricing_category, pricing_size_tier, COUNT(*)
-- FROM rooms
-- WHERE pricing_category IS NOT NULL
-- GROUP BY 1, 2 ORDER BY 1, 2;
--
-- SELECT id, display_name, room_number, wing, room_type, capacity_type
-- FROM rooms
-- WHERE pricing_category IS NULL OR pricing_size_tier IS NULL
-- ORDER BY wing, display_name, room_number;