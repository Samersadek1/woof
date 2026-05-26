/**
 * Dog size captured on Grooming / Daycare / Boarding intake forms.
 *
 * Run in Supabase SQL Editor if these columns are missing:
 *
 * ```sql
 * ALTER TABLE public.grooming_appointments ADD COLUMN IF NOT EXISTS dog_size text;
 * ALTER TABLE public.daycare_sessions ADD COLUMN IF NOT EXISTS dog_size text;
 * ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dog_size text;
 * ```
 *
 * Until PostgREST reloads its schema cache, hooks persist dog size via `notes` using
 * `appendDogSizeToNotes` / `withoutDogSizeColumn` in `@/lib/dogSizeNotes`.
 *
 * (Daycare check-ins persist to `daycare_sessions`; there is no `daycare_bookings` table in this app.)
 */
export const DOG_SIZE_FORM_OPTIONS = ["Small", "Medium", "Large", "Extra Large"] as const;

export type DogSizeFormValue = (typeof DOG_SIZE_FORM_OPTIONS)[number];

export const DEFAULT_DOG_SIZE: DogSizeFormValue = "Medium";

const PET_SIZE_TO_FORM: Record<string, DogSizeFormValue> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

const FORM_SIZE_RANK: Record<DogSizeFormValue, number> = {
  Small: 0,
  Medium: 1,
  Large: 2,
  "Extra Large": 3,
};

/** Map `pets.size` enum to the boarding/grooming form label, if set. */
export function petSizeToDogSizeFormValue(
  size: string | null | undefined,
): DogSizeFormValue | null {
  if (!size) return null;
  return PET_SIZE_TO_FORM[size.toLowerCase()] ?? null;
}

/** When multiple dogs are on a stay, bill at the largest profile size present. */
export function largestDogSizeFormValue(sizes: DogSizeFormValue[]): DogSizeFormValue | null {
  if (sizes.length === 0) return null;
  return sizes.reduce((max, cur) =>
    FORM_SIZE_RANK[cur] > FORM_SIZE_RANK[max] ? cur : max,
  );
}

type PetSizeSource = {
  id: string;
  name?: string | null;
  size?: string | null;
};

/** Resolve stay dog size from staff selection and/or linked pet profile sizes. */
export function resolveDogSizeForSelectedPets(
  petIds: string[],
  pets: PetSizeSource[],
  manualSize: DogSizeFormValue | null,
): {
  size: DogSizeFormValue | null;
  missingProfilePetNames: string[];
} {
  const selected = petIds
    .map((id) => pets.find((pet) => pet.id === id))
    .filter((pet): pet is PetSizeSource => !!pet);

  const missingProfilePetNames = selected
    .filter((pet) => !petSizeToDogSizeFormValue(pet.size))
    .map((pet) => pet.name?.trim() || "Dog");

  const profileSizes = selected
    .map((pet) => petSizeToDogSizeFormValue(pet.size))
    .filter((size): size is DogSizeFormValue => size != null);

  const derivedFromProfile =
    profileSizes.length === selected.length ? largestDogSizeFormValue(profileSizes) : null;

  if (manualSize) {
    return { size: manualSize, missingProfilePetNames };
  }

  if (derivedFromProfile) {
    return { size: derivedFromProfile, missingProfilePetNames: [] };
  }

  return { size: null, missingProfilePetNames };
}
