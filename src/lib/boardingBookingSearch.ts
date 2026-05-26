/** Fields used to match boarding bookings in calendar/list search. */
export type BoardingBookingSearchSlice = {
  id: string;
  booking_ref?: string | null;
  notes?: string | null;
  owners?: { first_name?: string | null; last_name?: string | null } | null;
  rooms?: { display_name?: string | null; room_number?: string | null } | null;
  booking_pets?: Array<{ pets?: { name?: string | null } | null }>;
};

export function boardingBookingSearchHaystack(booking: BoardingBookingSearchSlice): string {
  const petNames = (booking.booking_pets ?? [])
    .map((bp) => bp.pets?.name)
    .filter(Boolean)
    .join(" ");
  return [
    booking.booking_ref,
    booking.id,
    booking.owners?.first_name,
    booking.owners?.last_name,
    booking.rooms?.display_name,
    booking.rooms?.room_number,
    booking.notes,
    petNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Client-side filter/highlight — requires at least 2 characters to exclude non-matches. */
export function boardingBookingMatchesSearch(
  booking: BoardingBookingSearchSlice,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return true;
  return boardingBookingSearchHaystack(booking).includes(q);
}

export function boardingBookingSearchActive(query: string): boolean {
  return query.trim().length >= 2;
}
