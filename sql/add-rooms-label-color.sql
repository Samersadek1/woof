-- Optional room label color (Settings → Rooms color picker).
-- Run in Supabase SQL Editor if saving room colors fails with a missing column error.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS label_color text;

COMMENT ON COLUMN public.rooms.label_color IS 'Optional hex color label for staff visual identification (e.g. #3B82F6).';

SELECT 'rooms.label_color column applied' AS status;
