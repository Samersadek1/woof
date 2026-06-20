-- Grooming groomer roster (dropdown on appointments)
CREATE TABLE IF NOT EXISTS public.grooming_groomers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grooming_groomers_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS grooming_groomers_sort_idx
  ON public.grooming_groomers (sort_order, name);

ALTER TABLE public.grooming_groomers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grooming_groomers_all" ON public.grooming_groomers;
CREATE POLICY "grooming_groomers_all"
  ON public.grooming_groomers FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.grooming_groomers (name, sort_order, is_active)
SELECT v.name, v.sort_order, true
FROM (VALUES
  ('Ruben', 1),
  ('Eliane', 2)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_groomers g WHERE g.name = v.name
);

-- Verification:
-- SELECT id, name, sort_order, is_active FROM public.grooming_groomers ORDER BY sort_order, name;
