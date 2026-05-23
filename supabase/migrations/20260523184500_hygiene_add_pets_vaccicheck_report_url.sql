ALTER TABLE public.pets
ADD COLUMN IF NOT EXISTS vaccicheck_report_url text;
