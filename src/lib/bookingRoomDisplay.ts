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

/** Whether a boarding stay includes `asOf` (`check_out_date` is exclusive). */
export function bookingOccupiesDate(
  checkIn: string,
  checkOutExclusive: string,
  asOf: string,
): boolean {
  return checkIn <= asOf && checkOutExclusive > asOf;
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

export type RoomCalendarLayoutSegment<T> = {
  segStart: string;
  segEnd: string;
  payload: T;
};

/** Min/max assignment segment dates per booking on one room row. */
export function assignmentExtentsByBookingId(
  segments: Array<{ bookingId: string; start_date: string; end_date: string }>,
): Map<string, { minStart: string; maxEnd: string }> {
  const map = new Map<string, { minStart: string; maxEnd: string }>();
  for (const { bookingId, start_date, end_date } of segments) {
    const cur = map.get(bookingId);
    if (!cur) {
      map.set(bookingId, { minStart: start_date, maxEnd: end_date });
      continue;
    }
    if (start_date < cur.minStart) cur.minStart = start_date;
    if (end_date > cur.maxEnd) cur.maxEnd = end_date;
  }
  return map;
}

/**
 * Calendar bar span: use booking stay dates when imported BRA rows start late or end early.
 */
export function calendarSegmentLayoutBounds(args: {
  check_in_date: string;
  check_out_date: string;
  assignmentStart: string;
  assignmentEnd: string;
  isEarliestAssignment: boolean;
  isLatestAssignment: boolean;
}): { segStart: string; segEnd: string } {
  const lastNight = bookingLastOccupiedNight(args.check_in_date, args.check_out_date);
  let segStart = args.assignmentStart;
  let segEnd = args.assignmentEnd;
  if (args.isEarliestAssignment && segStart > args.check_in_date) {
    segStart = args.check_in_date;
  }
  if (args.isLatestAssignment && segEnd < lastNight) {
    segEnd = lastNight;
  }
  return { segStart, segEnd };
}

/** One guest bar in a room row — positioned with CSS grid column span (no flex overflow). */
export type RoomCalendarGridEvent<T> = {
  key: string;
  payload: T;
  colStart: number;
  colSpan: number;
  /** First visible day of this segment (for detail drawer context). */
  segStart: string;
};

/**
 * Lay out stay segments on a fixed day column grid.
 * Each segment becomes one bar; clipped to the visible window; no per-day merge map.
 */
export function layoutRoomCalendarEvents<T>(
  segments: RoomCalendarLayoutSegment<T>[],
  dayStrs: string[],
  windowStartStr: string,
  eventKey: (payload: T, segStart: string, segEnd: string) => string,
): RoomCalendarGridEvent<T>[] {
  if (dayStrs.length === 0) return [];

  const windowEndStr = dayStrs[dayStrs.length - 1]!;
  const events: RoomCalendarGridEvent<T>[] = [];

  for (const { segStart, segEnd, payload } of segments) {
    if (segEnd < dayStrs[0]! || segStart > windowEndStr) continue;

    const visibleStart = segStart < windowStartStr ? windowStartStr : segStart;
    const visibleEnd = segEnd > windowEndStr ? windowEndStr : segEnd;

    const startIdx = dayStrs.indexOf(visibleStart);
    const endIdx = dayStrs.indexOf(visibleEnd);
    if (startIdx < 0 || endIdx < 0) continue;

    events.push({
      key: eventKey(payload, segStart, segEnd),
      payload,
      colStart: startIdx + 1,
      colSpan: endIdx - startIdx + 1,
      segStart: visibleStart,
    });
  }

  return events.sort(
    (a, b) => a.colStart - b.colStart || a.segStart.localeCompare(b.segStart),
  );
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
