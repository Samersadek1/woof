import { format, isValid, parseISO } from "date-fns";

/** True when value is a calendar date string that date-fns can format (YYYY-MM-DD). */
export function isValidIsoDate(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === "") return false;
  const slice = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slice)) return false;
  return isValid(parseISO(slice));
}

/** Format a date string safely; returns fallback when missing or invalid. */
export function formatIsoDate(
  value: string | null | undefined,
  pattern: string,
  fallback = "—",
): string {
  if (!isValidIsoDate(value)) return fallback;
  return format(parseISO(String(value).slice(0, 10)), pattern);
}

/** Normalize optional pet profile date fields before Supabase insert/update or display. */
export function normalizePetDateOfBirth<T extends { date_of_birth?: string | null }>(pet: T): T {
  const dob = pet.date_of_birth;
  if (dob == null || String(dob).trim() === "") {
    return { ...pet, date_of_birth: null };
  }
  if (!isValidIsoDate(dob)) {
    return { ...pet, date_of_birth: null };
  }
  return pet;
}
