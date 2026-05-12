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
 * (Daycare check-ins persist to `daycare_sessions`; there is no `daycare_bookings` table in this app.)
 */
export const DOG_SIZE_FORM_OPTIONS = ["Small", "Medium", "Large", "Extra Large"] as const;

export type DogSizeFormValue = (typeof DOG_SIZE_FORM_OPTIONS)[number];

export const DEFAULT_DOG_SIZE: DogSizeFormValue = "Medium";
