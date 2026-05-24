import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type BookingRoomAssignmentRoom = Pick<Room, "room_number" | "display_name" | "cam_id">;

export type BookingRoomAssignmentSlice = {
  start_date: string;
  end_date: string;
  rooms: BookingRoomAssignmentRoom | null;
};

export function sortedAssignmentSlices(
  assignments: BookingRoomAssignmentSlice[] | null | undefined,
): BookingRoomAssignmentSlice[] {
  return [...(assignments ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Whether an assignment segment covers a calendar/occupancy date (inclusive end). */
export function assignmentCoversDate(
  slice: Pick<BookingRoomAssignmentSlice, "start_date" | "end_date">,
  asOf: string,
): boolean {
  return slice.start_date <= asOf && slice.end_date >= asOf;
}

export function roomAssignmentForDate(
  assignments: BookingRoomAssignmentSlice[] | null | undefined,
  asOf: string,
): BookingRoomAssignmentSlice | null {
  const rows = sortedAssignmentSlices(assignments);
  return rows.find((row) => assignmentCoversDate(row, asOf)) ?? null;
}

function roomLabelFromRoom(room: BookingRoomAssignmentRoom | null | undefined): string | null {
  if (!room) return null;
  return room.room_number?.trim() || room.display_name?.trim() || null;
}

function isPlaceholderRoomLabel(room: BookingRoomAssignmentRoom): boolean {
  const num = (room.room_number ?? "").trim();
  if (num.startsWith("UNK-")) return true;
  const name = (room.display_name ?? "").trim();
  return name.startsWith("Unknown ·") || name.startsWith("Unknown -");
}

/** Room label for kennel card / detail — assignment on `asOfDate` wins over stale `bookings.room_id`. */
export function roomLabelForBooking(
  booking: {
    check_in_date: string;
    rooms?: BookingRoomAssignmentRoom | null;
  },
  assignments: BookingRoomAssignmentSlice[] | null | undefined,
  options?: { asOfDate?: string },
): string {
  const asOf = options?.asOfDate ?? booking.check_in_date;
  const slices = sortedAssignmentSlices(assignments);
  const onDate = roomAssignmentForDate(slices, asOf);
  const fromAssignment = roomLabelFromRoom(onDate?.rooms);
  if (fromAssignment) return fromAssignment;

  const bookingRoom = booking.rooms;
  if (bookingRoom && !isPlaceholderRoomLabel(bookingRoom)) {
    const fromBooking = roomLabelFromRoom(bookingRoom);
    if (fromBooking) return fromBooking;
  }

  if (slices.length > 0) {
    const first = roomLabelFromRoom(slices[0]?.rooms);
    if (first) return first;
  }

  if (bookingRoom) {
    const fromPlaceholder = roomLabelFromRoom(bookingRoom);
    if (fromPlaceholder) return fromPlaceholder;
  }

  return "Unassigned";
}

export function formatAssignmentDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} – ${end}`;
}

/** Calendar chip width: assignment end_date is inclusive (both start and end count). */
export function assignmentCalendarColumnSpan(startDate: string, endDate: string): number {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

/** Last boarding night for calendar chips (`check_out_date` is exclusive). */
export function bookingLastOccupiedNight(checkIn: string, checkOutExclusive: string): string {
  const last = addDays(parseISO(checkOutExclusive), -1);
  const checkInDate = parseISO(checkIn);
  if (last < checkInDate) return checkIn;
  return format(last, "yyyy-MM-dd");
}

export type RoomCalendarDayCell<T> = {
  payload: T;
  span: number;
  isFirst: boolean;
};

export type RoomCalendarSegment<T> = {
  kind: "assignment" | "booking";
  segStart: string;
  segEnd: string;
  payload: T;
};

/**
 * Maps each visible day in a room row to the guest chip shown that day.
 * Span is measured from the first *visible* day of the segment (not idx 0),
 * so a clipped multi-day stay does not paint over the next room guest.
 */
export function buildRoomCalendarDayMap<T>(
  segments: RoomCalendarSegment<T>[],
  dayStrs: string[],
  windowStartStr: string,
  endOfWindowStr: string,
): Map<string, RoomCalendarDayCell<T>> {
  const dayMap = new Map<string, RoomCalendarDayCell<T>>();

  for (const segment of segments) {
    const { kind, segStart, segEnd, payload } = segment;
    const visibleSegStart = segStart < windowStartStr ? windowStartStr : segStart;

    for (const dayStr of dayStrs) {
      if (dayStr < segStart || dayStr > segEnd) continue;

      const isFirst = dayStr === visibleSegStart;
      if (isFirst) {
        const chipEnd = segEnd < endOfWindowStr ? segEnd : endOfWindowStr;
        const span = assignmentCalendarColumnSpan(dayStr, chipEnd);
        dayMap.set(dayStr, { payload, span, isFirst: true });
      } else if (!dayMap.has(dayStr)) {
        dayMap.set(dayStr, { payload, span: 1, isFirst: false });
      }
    }
  }

  return dayMap;
}

export function formatRoomAssignmentsSummary(
  assignments: BookingRoomAssignmentSlice[] | null | undefined,
  options?: { highlightDate?: string },
): string[] {
  const highlight = options?.highlightDate;
  return sortedAssignmentSlices(assignments).map((slice) => {
    const label = roomLabelFromRoom(slice.rooms) ?? "—";
    const range = formatAssignmentDateRange(slice.start_date, slice.end_date);
    const mark =
      highlight && assignmentCoversDate(slice, highlight) ? " (this day)" : "";
    return `${label}: ${range}${mark}`;
  });
}
