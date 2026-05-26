/** Normalize optional pet profile date fields before Supabase insert/update. */
export function normalizePetDateOfBirth<T extends { date_of_birth?: string | null }>(pet: T): T {
  const dob = pet.date_of_birth;
  return {
    ...pet,
    date_of_birth: dob == null || String(dob).trim() === "" ? null : dob,
  };
}
