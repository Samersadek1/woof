-- Add num_dogs to daycare_package_types (run in Supabase SQL editor)
ALTER TABLE public.daycare_package_types
  ADD COLUMN IF NOT EXISTS num_dogs integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.daycare_package_types.num_dogs IS 'Number of dogs included in this package type tier';
