-- Adds rooms.camera_recording for Manage Rooms (camera toggle).
-- Apply once per Supabase project: Dashboard → SQL Editor → Run.
-- Idempotent: safe to re-run.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS camera_recording boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rooms.camera_recording IS 'Whether this room has camera recording enabled.';

-- If errors persist about "schema cache", reload PostgREST: run as superuser in SQL Editor:
--   NOTIFY pgrst, 'reload schema';
-- Or use Supabase Dashboard → Project Settings → pause/resume project (or wait ~1 min).
