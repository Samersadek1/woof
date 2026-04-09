import { differenceInCalendarDays, addDays, format, parseISO } from "date-fns";

/**
 * Returns the number of nights between two ISO date strings.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

/** From `booking_items(count)` on list/detail booking queries */
export function bookingBelongingsCount(b: {
  booking_items?: { count: number }[];
}): number {
  return Number(b.booking_items?.[0]?.count ?? 0);
}

/**
 * Returns "PET1, PET2 – SURNAME" in uppercase, truncated to 30 chars.
 */
export function formatBookingCell(petNames: string[], ownerLastName: string): string {
  const pets = petNames.join(", ");
  const full = [pets, ownerLastName]
    .filter(Boolean)
    .join(" – ")
    .toUpperCase();
  return full.length > 30 ? `${full.slice(0, 30)}…` : full;
}

/**
 * Returns Tailwind CSS classes for a booking status badge.
 */
export function getStatusColour(status: string): string {
  const map: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    checked_in: "bg-green-100 text-green-800 border-green-200",
    checked_out: "bg-gray-100 text-gray-600 border-gray-200",
    enquiry: "bg-yellow-100 text-yellow-800 border-yellow-200",
    cancelled: "bg-red-100 text-red-600 border-red-200",
  };
  return map[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

/**
 * Returns true if the given date falls within the booking's
 * check_in_date (inclusive) to check_out_date (exclusive — checkout day
 * is the departure day, not an occupied night).
 */
export function isBookingOnDate(
  booking: { check_in_date: string; check_out_date: string },
  date: string
): boolean {
  return date >= booking.check_in_date && date < booking.check_out_date;
}

/**
 * Returns all bookings for a specific room that occupy the given date.
 */
export function getBookingsForRoomAndDate(
  bookings: { room_id: string; check_in_date: string; check_out_date: string }[],
  roomId: string,
  date: string
): typeof bookings {
  return bookings.filter(
    (b) => b.room_id === roomId && isBookingOnDate(b, date)
  );
}

/**
 * Returns an array of N date strings (YYYY-MM-DD) starting from startDate.
 */
export function generateDateRange(startDate: string, days: number): string[] {
  const base = parseISO(startDate);
  return Array.from({ length: days }, (_, i) =>
    format(addDays(base, i), "yyyy-MM-dd")
  );
}
