/** Pet care notes: import/RPC use `*_notes`; legacy columns are older UI names. */
export type PetCareNotesFields = {
  feeding_notes?: string | null;
  feeding_instructions?: string | null;
  medication_notes?: string | null;
  medications?: string | null;
  behaviour_notes?: string | null;
  behavioural_notes?: string | null;
};

export function petFeedingNotes(pet: PetCareNotesFields | null | undefined): string {
  return (pet?.feeding_notes ?? pet?.feeding_instructions ?? "").trim();
}

export function petMedicationNotes(pet: PetCareNotesFields | null | undefined): string {
  return (pet?.medication_notes ?? pet?.medications ?? "").trim();
}

export function petBehaviourNotes(pet: PetCareNotesFields | null | undefined): string {
  return (pet?.behaviour_notes ?? pet?.behavioural_notes ?? "").trim();
}

/** Supabase nested `pets(...)` fragment for booking/check-in care fallbacks. */
export const PET_CARE_NOTES_SELECT =
  "feeding_notes, medication_notes, behaviour_notes, feeding_instructions, medications, behavioural_notes";
