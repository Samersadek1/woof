-- Room label color for visual identification on the Rooms admin table / boarding calendar.
-- Apply via: supabase db push / migrate, or paste into Dashboard → SQL Editor.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS label_color text;

COMMENT ON COLUMN public.rooms.label_color IS 'Optional hex color label for staff visual identification (e.g. #3B82F6).';
