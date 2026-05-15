/**
 * PostgREST schema cache may not expose `dog_size` on bookings / grooming_appointments /
 * daycare_sessions. Persist the value in `notes` until the cache is reloaded.
 */
export function appendDogSizeToNotes(
  notes: string | null | undefined,
  dogSize: string | null | undefined,
): string | null {
  const line = dogSize?.trim() ? `Dog size: ${dogSize.trim()}` : "";
  const merged = [notes?.trim() ? notes.trim() : "", line].filter(Boolean).join("\n");
  return merged || null;
}

/** Remove `dog_size` from insert/update payloads; merge into `notes`. */
export function withoutDogSizeColumn<T extends { dog_size?: string | null; notes?: string | null }>(
  payload: T,
): Omit<T, "dog_size"> {
  const { dog_size, notes, ...rest } = payload;
  return {
    ...rest,
    notes: appendDogSizeToNotes(notes, dog_size),
  } as Omit<T, "dog_size">;
}
