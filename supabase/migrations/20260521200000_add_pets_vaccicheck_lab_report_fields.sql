-- Lab report fields: result mode toggle, numerical antibody values, recommendations.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vaccicheck_result_mode text DEFAULT 's_class',
  ADD COLUMN IF NOT EXISTS vaccicheck_cdv_value numeric,
  ADD COLUMN IF NOT EXISTS vaccicheck_cpv_value numeric,
  ADD COLUMN IF NOT EXISTS vaccicheck_cav_value numeric,
  ADD COLUMN IF NOT EXISTS vaccicheck_recommendations text;

COMMENT ON COLUMN public.pets.vaccicheck_result_mode IS 's_class or numerical — how titre results are recorded';
COMMENT ON COLUMN public.pets.vaccicheck_cdv_value IS 'Canine Distemper (CDV) antibody titre value';
COMMENT ON COLUMN public.pets.vaccicheck_cpv_value IS 'Canine Parvovirus (CPV) antibody titre value';
COMMENT ON COLUMN public.pets.vaccicheck_cav_value IS 'Canine Adenovirus (CAV) antibody titre value';
COMMENT ON COLUMN public.pets.vaccicheck_recommendations IS 'Lab report recommendations / clinical notes';

NOTIFY pgrst, 'reload schema';
