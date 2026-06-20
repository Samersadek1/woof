import type { Database } from "@/integrations/supabase/types";
import { bookingOccupiesDate } from "@/lib/bookingRoomDisplay";

/** Row shape returned by grooming booking link search. */
export type GroomingBookingLinkHit = {
  id: string;
  booking_ref: string | null;
  owner_id: string;
  booking_type: Database["public"]["Enums"]["booking_type"] | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  owners: { first_name: string; last_name: string; phone?: string | null } | null;
  booking_pets: { pet_id: string; pets: { name: string } | null }[];
};

export type GroomingStayLinkInfo = {
  booking_type: Database["public"]["Enums"]["booking_type"] | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  booking_ref?: string | null;
};

export const GROOMING_LINKABLE_BOOKING_STATUSES = new Set<
  Database["public"]["Enums"]["booking_status"]
>(["confirmed", "checked_in"]);

export const GROOMING_LINKABLE_BOOKING_TYPES = new Set<
  Database["public"]["Enums"]["booking_type"]
>(["boarding", "daycare"]);

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

/** Whether a grooming appointment date falls on a stay day (incl. boarding checkout day). */
export function groomingStayCoversDate(
  booking: Pick<GroomingStayLinkInfo, "booking_type" | "check_in_date" | "check_out_date">,
  groomingDate: string,
): boolean {
  if (booking.booking_type === "daycare") {
    return booking.check_in_date === groomingDate;
  }
  return (
    bookingOccupiesDate(booking.check_in_date, booking.check_out_date, groomingDate) ||
    booking.check_out_date === groomingDate
  );
}

export function isGroomingLinkableBookingStatus(
  status: string,
): status is Database["public"]["Enums"]["booking_status"] {
  return GROOMING_LINKABLE_BOOKING_STATUSES.has(
    status as Database["public"]["Enums"]["booking_status"],
  );
}

export function isGroomingLinkableToBooking(
  booking: GroomingStayLinkInfo | null | undefined,
  groomingDate: string,
): boolean {
  if (!booking?.booking_type) return false;
  if (!GROOMING_LINKABLE_BOOKING_TYPES.has(booking.booking_type)) return false;
  if (!isGroomingLinkableBookingStatus(booking.status)) return false;
  return groomingStayCoversDate(booking, groomingDate);
}

export function activeLinkedStayLabel(
  booking: GroomingStayLinkInfo | null | undefined,
  groomingDate: string,
): string | null {
  if (!isGroomingLinkableToBooking(booking, groomingDate)) return null;
  if (booking!.booking_type === "boarding") {
    return booking!.booking_ref ? `Boarding · ${booking!.booking_ref}` : "Boarding";
  }
  if (booking!.booking_type === "daycare") {
    return booking!.booking_ref ? `Daycare · ${booking!.booking_ref}` : "Daycare";
  }
  return null;
}
