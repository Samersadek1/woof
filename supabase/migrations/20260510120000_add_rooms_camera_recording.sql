-- Manage Rooms: persist camera_recording toggle on public.rooms.
-- Apply via: supabase db push / migrate, or paste into Dashboard → SQL Editor.
-- Idempotent.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS camera_recording boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rooms.camera_recording IS 'Whether this room has camera recording enabled.';
