-- Dog breeds reference table (Settings-managed).
-- Vet clinics: see supabase/migrations/20260519120000_vet_clinics.sql
-- Run in Supabase SQL Editor after review. Then run sql/seed-reference-lists.sql to import defaults.

CREATE TABLE IF NOT EXISTS dog_breeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dog_breeds_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_dog_breeds_sort ON dog_breeds (sort_order, name);

ALTER TABLE dog_breeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dog_breeds_authenticated_all" ON dog_breeds;
CREATE POLICY "dog_breeds_authenticated_all" ON dog_breeds
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

SELECT 'reference lists DDL applied' AS status;
