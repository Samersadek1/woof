-- Phase 5: per-pet grooming notes log. Idempotent.

CREATE TABLE IF NOT EXISTS public.pet_grooming_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.grooming_appointments(id) ON DELETE SET NULL,
  note text NOT NULL,
  written_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pet_grooming_notes_pet_id
  ON public.pet_grooming_notes(pet_id);

CREATE INDEX IF NOT EXISTS idx_pet_grooming_notes_appointment_id
  ON public.pet_grooming_notes(appointment_id);

ALTER TABLE public.pet_grooming_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_grooming_notes_all" ON public.pet_grooming_notes;
CREATE POLICY "pet_grooming_notes_all"
  ON public.pet_grooming_notes FOR ALL USING (true) WITH CHECK (true);

-- Verification:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'pet_grooming_notes' ORDER BY ordinal_position;
