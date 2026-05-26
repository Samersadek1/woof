import type { BookingWithDetails, CalendarRoomAssignment } from "@/hooks/useBookings";
import { isRetiredCatteryWing } from "./retiredFacilities";
import type { Database } from "@/integrations/supabase/types";
import {
  buildKennelAssignmentContext,
  hasKennelRoomOnDate,
  unassignedNightRangesInWindow,
  type KennelAssignmentSlice,
} from "./kennelAssignmentOnDate";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type BoardingCalendarSegment =
  | { kind: "assignment"; assignment: CalendarRoomAssignment }
  | {
      kind: "booking";
      booking: BookingWithDetails;
      /** Inclusive night range for calendar chips (defaults to full stay). */
      segStart?: string;
      segEnd?: string;
    };

export type BoardingCalendarModel = {
  assignmentsByRoom: Map<string, CalendarRoomAssignment[]>;
  bookingsByRoom: Map<string, BookingWithDetails[]>;
  unassignedBookings: BookingWithDetails[];
  /** Per-booking unassigned night ranges in the calendar window (for clipped chips). */
  unassignedClipsByBookingId: Map<string, Array<{ start: string; end: string }>>;
  sortedUnassignedBookings: BookingWithDetails[];
  assignmentsByBookingId: Map<string, CalendarRoomAssignment[]>;
};

/**
 * Group bookings and assignment segments for the room × day calendar.
 * Unassigned uses the same kennel-on-date rules as the occupancy report for `unassignedAsOfDate`.
 */
export function buildBoardingCalendarModel(args: {
  bookings: BookingWithDetails[];
  roomAssignments: CalendarRoomAssignment[];
  facilityRoomIds: Set<string>;
  /** Facility rooms list (for kennel pool / placeholder context). */
  facilityRooms: Room[];
  windowStart: string;
  windowEnd: string;
  /** Date to match occupancy “unassigned guests” (e.g. today when in the week window). */
  unassignedAsOfDate: string;
}): BoardingCalendarModel {
  const {
    bookings,
    roomAssignments,
    facilityRoomIds,
    facilityRooms,
    windowStart,
    windowEnd,
    unassignedAsOfDate,
  } = args;

  const kennelCtx = buildKennelAssignmentContext(facilityRooms);
  const assignmentSlices: KennelAssignmentSlice[] = roomAssignments.map((row) => ({
    booking_id: row.booking_id,
    room_id: row.room_id,
    start_date: row.start_date,
    end_date: row.end_date,
  }));

  const assignmentMap = new Map<string, CalendarRoomAssignment[]>();
  const bookingIdsWithSegments = new Set<string>();

  for (const row of roomAssignments) {
    if (isRetiredCatteryWing(row.rooms.wing)) continue;
    if (!facilityRoomIds.has(row.room_id)) continue;
    bookingIdsWithSegments.add(row.booking_id);
    const list = assignmentMap.get(row.room_id) ?? [];
    list.push(row);
    assignmentMap.set(row.room_id, list);
  }

  const roomIdMap = new Map<string, BookingWithDetails[]>();
  const unassigned: BookingWithDetails[] = [];
  const unassignedClipsByBookingId = new Map<string, Array<{ start: string; end: string }>>();

  for (const b of bookings) {
    if (b.booking_type && b.booking_type !== "boarding") continue;
    if (isRetiredCatteryWing(b.rooms?.wing)) continue;

    const clips = unassignedNightRangesInWindow(
      b,
      assignmentSlices,
      kennelCtx,
      windowStart,
      windowEnd,
    );
    if (clips.length > 0) {
      unassignedClipsByBookingId.set(b.id, clips);
    }

    const unassignedOnReportDate =
      hasKennelRoomOnDate(b, assignmentSlices, kennelCtx, unassignedAsOfDate) === false &&
      b.check_in_date <= unassignedAsOfDate &&
      b.check_out_date > unassignedAsOfDate;

    if (unassignedOnReportDate) {
      unassigned.push(b);
    }

    if (bookingIdsWithSegments.has(b.id)) continue;

    if (!b.room_id || !facilityRoomIds.has(b.room_id)) {
      continue;
    }

    const list = roomIdMap.get(b.room_id) ?? [];
    list.push(b);
    roomIdMap.set(b.room_id, list);
  }

  const assignmentsByBookingId = new Map<string, CalendarRoomAssignment[]>();
  for (const row of roomAssignments) {
    const list = assignmentsByBookingId.get(row.booking_id) ?? [];
    list.push(row);
    assignmentsByBookingId.set(row.booking_id, list);
  }

  const sortedUnassignedBookings = [...unassigned].sort((a, b) => {
    const byCheckIn = a.check_in_date.localeCompare(b.check_in_date);
    if (byCheckIn !== 0) return byCheckIn;
    const petA = a.booking_pets?.[0]?.pets?.name ?? "";
    const petB = b.booking_pets?.[0]?.pets?.name ?? "";
    return petA.localeCompare(petB);
  });

  return {
    assignmentsByRoom: assignmentMap,
    bookingsByRoom: roomIdMap,
    unassignedBookings: unassigned,
    unassignedClipsByBookingId,
    sortedUnassignedBookings,
    assignmentsByBookingId,
  };
}

export function calendarSegmentsForRoom(
  model: Pick<BoardingCalendarModel, "assignmentsByRoom" | "bookingsByRoom">,
  roomId: string,
): BoardingCalendarSegment[] {
  return [
    ...(model.assignmentsByRoom.get(roomId) ?? []).map((assignment) => ({
      kind: "assignment" as const,
      assignment,
    })),
    ...(model.bookingsByRoom.get(roomId) ?? []).map((booking) => ({
      kind: "booking" as const,
      booking,
    })),
  ];
}

export function unassignedCalendarSegments(
  model: Pick<BoardingCalendarModel, "unassignedClipsByBookingId">,
  booking: BookingWithDetails,
): BoardingCalendarSegment[] {
  const clips = model.unassignedClipsByBookingId.get(booking.id);
  if (!clips || clips.length === 0) {
    return [{ kind: "booking", booking }];
  }
  return clips.map((clip) => ({
    kind: "booking" as const,
    booking,
    segStart: clip.start,
    segEnd: clip.end,
  }));
}

export function unassignedCalendarRowLabel(booking: BookingWithDetails): string {
  const pet = booking.booking_pets?.[0]?.pets?.name ?? "";
  const owner = booking.owners?.last_name ?? "";
  return [pet, owner].filter(Boolean).join(" – ") || booking.booking_ref || "Unassigned";
}
