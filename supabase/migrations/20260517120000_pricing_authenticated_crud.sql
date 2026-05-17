-- Allow authenticated staff to read and manage the pricing rate card.
-- (Anon/public clients were blocked by RLS on INSERT/UPDATE/DELETE.)

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
