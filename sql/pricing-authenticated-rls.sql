-- Run in Supabase SQL Editor if pricing add/edit/delete fails with RLS errors.
-- Safe to run multiple times.

ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_all" ON public.pricing;
DROP POLICY IF EXISTS "pricing_authenticated_all" ON public.pricing;
DROP POLICY IF EXISTS "pricing_authenticated_select" ON public.pricing;
DROP POLICY IF EXISTS "pricing_authenticated_insert" ON public.pricing;
DROP POLICY IF EXISTS "pricing_authenticated_update" ON public.pricing;
DROP POLICY IF EXISTS "pricing_authenticated_delete" ON public.pricing;

CREATE POLICY "pricing_authenticated_all" ON public.pricing
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

SELECT 'pricing authenticated RLS applied' AS status;
