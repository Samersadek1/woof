/** Row shape returned by grooming booking link search. */
export type GroomingBookingLinkHit = {
  id: string;
  booking_ref: string | null;
  owner_id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  owners: { first_name: string; last_name: string; phone?: string | null } | null;
  booking_pets: { pet_id: string; pets: { name: string } | null }[];
};

export function mergeGroomingBookingLinkHits(
  existing: GroomingBookingLinkHit[],
  incoming: GroomingBookingLinkHit[] | null | undefined,
): GroomingBookingLinkHit[] {
  const merged = [...existing];
  const seen = new Set(merged.map((b) => b.id));
  for (const row of incoming ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export function groomingBookingLinkPetIds(hit: GroomingBookingLinkHit): string[] {
  return hit.booking_pets.map((bp) => bp.pet_id).filter(Boolean);
}

export function formatGroomingBookingLinkPets(hit: GroomingBookingLinkHit): string {
  return (
    hit.booking_pets
      .map((bp) => bp.pets?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
}
