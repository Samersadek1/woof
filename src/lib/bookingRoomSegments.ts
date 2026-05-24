import type { BookingWithDetails } from "@/hooks/useBookings";
import type { Database } from "@/integrations/supabase/types";
import {
  assignmentCoversDate,
  roomAssignmentForDate,
  sortedAssignmentSlices,
  type BookingRoomAssignmentSlice,
} from "./bookingRoomDisplay";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type BookingRoomSegment = BookingRoomAssignmentSlice & {
  id?: string;
  room_id?: string;
};

export type BookingWithSegments = BookingWithDetails & {
  booking_room_assignments?: BookingRoomSegment[];
};

/** Alias: segment covering a calendar date (inclusive end). */
export function getSegmentForDate(
  segments: BookingRoomAssignmentSlice[] | null | undefined,
  date: string,
): BookingRoomAssignmentSlice | null {
  return roomAssignmentForDate(segments, date);
}

/** Room row for a booking on a given date — segment wins over bookings.room_id. */
export function getBookingRoomForDate(
  booking: Pick<BookingWithDetails, "room_id" | "rooms" | "check_in_date">,
  segments: BookingRoomAssignmentSlice[] | null | undefined,
  date: string,
): Room | BookingRoomAssignmentSlice["rooms"] | null {
  const seg = getSegmentForDate(segments, date);
  if (seg?.rooms) return seg.rooms;
  if (booking.room_id && booking.rooms) return booking.rooms;
  return null;
}

/** Whether booking stay window overlaps a segment date window (inclusive segment end). */
export function bookingOverlapsSegmentWindow(
  booking: Pick<BookingWithDetails, "check_in_date" | "check_out_date">,
  segment: Pick<BookingRoomAssignmentSlice, "start_date" | "end_date">,
): boolean {
  const stayLastNight = addDaysIso(booking.check_out_date, -1);
  if (stayLastNight < booking.check_in_date) return false;
  return (
    segment.start_date <= stayLastNight &&
    segment.end_date >= booking.check_in_date
  );
}

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function segmentsForBooking(
  booking: BookingWithSegments,
): BookingRoomAssignmentSlice[] {
  const fromJoin = booking.booking_room_assignments?.map((row) => ({
    start_date: row.start_date,
    end_date: row.end_date,
    rooms: row.rooms ?? null,
  }));
  return sortedAssignmentSlices(fromJoin);
}

export function segmentCoversDate(
  segment: Pick<BookingRoomSegment, "start_date" | "end_date">,
  date: string,
): boolean {
  return assignmentCoversDate(segment, date);
}
