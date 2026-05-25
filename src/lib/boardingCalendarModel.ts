import type { BookingWithDetails, CalendarRoomAssignment } from "@/hooks/useBookings";

export type BoardingCalendarSegment =
  | { kind: "assignment"; assignment: CalendarRoomAssignment }
  | { kind: "booking"; booking: BookingWithDetails };

export type BoardingCalendarModel = {
  assignmentsByRoom: Map<string, CalendarRoomAssignment[]>;
  bookingsByRoom: Map<string, BookingWithDetails[]>;
  unassignedBookings: BookingWithDetails[];
  sortedUnassignedBookings: BookingWithDetails[];
  assignmentsByBookingId: Map<string, CalendarRoomAssignment[]>;
};

/**
 * Group bookings and assignment segments for the room × day calendar.
 * Assignments win over `bookings.room_id`; bookings with any BRA are not legacy room rows.
 */
export function buildBoardingCalendarModel(args: {
  bookings: BookingWithDetails[];
  roomAssignments: CalendarRoomAssignment[];
  facilityRoomIds: Set<string>;
}): BoardingCalendarModel {
  const { bookings, roomAssignments, facilityRoomIds } = args;

  const assignmentMap = new Map<string, CalendarRoomAssignment[]>();
  const bookingIdsWithSegments = new Set<string>();

  for (const row of roomAssignments) {
    if (row.rooms.wing === "cattery") continue;
    if (!facilityRoomIds.has(row.room_id)) continue;
    bookingIdsWithSegments.add(row.booking_id);
    const list = assignmentMap.get(row.room_id) ?? [];
    list.push(row);
    assignmentMap.set(row.room_id, list);
  }

  const roomIdMap = new Map<string, BookingWithDetails[]>();
  const unassigned: BookingWithDetails[] = [];

  for (const b of bookings) {
    if (b.booking_type && b.booking_type !== "boarding") continue;
    if (b.rooms?.wing === "cattery") continue;

    if (bookingIdsWithSegments.has(b.id)) continue;

    if (!b.room_id || !facilityRoomIds.has(b.room_id)) {
      unassigned.push(b);
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

export function unassignedCalendarRowLabel(booking: BookingWithDetails): string {
  const pet = booking.booking_pets?.[0]?.pets?.name ?? "";
  const owner = booking.owners?.last_name ?? "";
  return [pet, owner].filter(Boolean).join(" – ") || booking.booking_ref || "Unassigned";
}
