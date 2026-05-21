-- Idempotent: ensure room_types table, create_room_type RPC, grants, and PostgREST reload.
-- Fixes "Could not find the function public.create_room_type(p_label) in the schema cache".

CREATE TABLE IF NOT EXISTS public.room_types (
  slug text PRIMARY KEY,
  label text NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_types_label_unique UNIQUE (label)
);

CREATE INDEX IF NOT EXISTS idx_room_types_label ON public.room_types (label);

ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_types_authenticated_all" ON public.room_types;
CREATE POLICY "room_types_authenticated_all" ON public.room_types
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.room_types (slug, label, is_builtin) VALUES
  ('presidential_super', 'Presidential Super', true),
  ('presidential_standard', 'Presidential Standard', true),
  ('presidential_single', 'Presidential Single', true),
  ('presidential_double', 'Presidential Double', true),
  ('royal_suite_double', 'Royal Suite Double', true),
  ('royal_suite_single', 'Royal Suite Single', true),
  ('double_royal', 'Double Royal', true),
  ('single_royal', 'Single Royal', true),
  ('family_room', 'Family Room', true),
  ('royal_annex', 'Royal Annex', true),
  ('cattery_super_presidential', 'Cattery Super Presidential', true),
  ('cattery_presidential', 'Cattery Presidential', true),
  ('cattery_deluxe', 'Cattery Deluxe', true),
  ('park_lane', 'Park Lane', true),
  ('pall_mall', 'Pall Mall', true),
  ('kennels', 'Back Kennels', true),
  ('deluxe', 'Deluxe', true),
  ('standard', 'Standard', true),
  ('standard_glass', 'Standard Glass', true),
  ('lg_deluxe', 'LG Deluxe', true),
  ('lg_royal', 'LG Royal', true),
  ('lg_standard', 'LG Standard', true),
  ('lg_presidential', 'LG Presidential', true),
  ('lg_presidential_double', 'LG Presidential Double', true),
  ('lg_royal_double', 'LG Royal Double', true),
  ('lg_standard_luxury', 'LG Standard Luxury', true),
  ('lg_resting_nook', 'LG Resting Nook', true),
  ('kitchen', 'Kitchen', true)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_room_type(p_label text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_label text;
BEGIN
  v_label := trim(p_label);
  IF v_label = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  v_slug := regexp_replace(
    regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g'),
    '^_+|_+$',
    '',
    'g'
  );

  IF v_slug = '' THEN
    RAISE EXCEPTION 'Name must contain at least one letter or number';
  END IF;

  IF EXISTS (SELECT 1 FROM public.room_types WHERE slug = v_slug OR label = v_label) THEN
    RAISE EXCEPTION 'Room type already exists';
  END IF;

  EXECUTE format('ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS %L', v_slug);

  INSERT INTO public.room_types (slug, label, is_builtin)
  VALUES (v_slug, v_label, false);

  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_type(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_room_type(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_type(text) TO service_role;

NOTIFY pgrst, 'reload schema';
