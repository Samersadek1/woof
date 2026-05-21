-- Idempotent: ensure vet_clinics table exists with current schema.
-- No DROP TABLE vet_clinics exists in this repo; a missing table usually means
-- migration 20260519120000_vet_clinics.sql was never applied to this Supabase project
-- (or the database was reset / recreated without re-running migrations).

CREATE TABLE IF NOT EXISTS public.vet_clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vet_clinics_name_unique UNIQUE (name)
);

ALTER TABLE public.vet_clinics ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.vet_clinics ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vet_clinics ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.vet_clinics DROP COLUMN IF EXISTS sort_order;

CREATE INDEX IF NOT EXISTS idx_vet_clinics_active_name ON public.vet_clinics (is_active, name);

ALTER TABLE public.vet_clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vet_clinics_authenticated_all" ON public.vet_clinics;
CREATE POLICY "vet_clinics_authenticated_all" ON public.vet_clinics
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
