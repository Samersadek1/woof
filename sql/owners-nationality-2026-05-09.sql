-- Customer nationality (free text, optional)
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS nationality text;

COMMENT ON COLUMN public.owners.nationality IS 'Customer nationality (display / CRM; optional).';
