import { describe, expect, it } from "vitest";

import {
  buildBoardingCalendarModel,
  calendarSegmentsForRoom,
  unassignedCalendarSegments,
} from "./boardingCalendarModel";

describe("buildBoardingCalendarModel", () => {
  const facilityIds = new Set(["room-a1", "room-daycare"]);
  const facilityRooms = [
    {
      id: "room-a1",
      room_number: "A1",
      wing: "back_kennels",
      is_active: true,
      display_name: "A1",
    },
    {
      id: "room-daycare",
      room_number: "Daycare 1-1",
      wing: "back_kennels",
      is_active: true,
      display_name: "Daycare 1-1",
    },
  ] as never[];

  it("puts bookings without segments in unassigned when no room_id", () => {
    const model = buildBoardingCalendarModel({
      facilityRoomIds: facilityIds,
      facilityRooms,
      windowStart: "2026-05-25",
      windowEnd: "2026-05-31",
      unassignedAsOfDate: "2026-05-26",
      bookings: [
        {
          id: "b1",
          booking_type: "boarding",
          room_id: null,
          check_in_date: "2026-05-26",
          check_out_date: "2026-05-28",
          booking_pets: [],
        } as never,
      ],
      roomAssignments: [],
    });

    expect(model.unassignedBookings).toHaveLength(1);
    expect(model.bookingsByRoom.size).toBe(0);
  });

  it("uses assignment rows per room and ignores legacy room_id when BRA exists", () => {
    const booking = {
      id: "b1",
      booking_type: "boarding",
      room_id: "room-a1",
      check_in_date: "2026-05-26",
      check_out_date: "2026-05-28",
      booking_pets: [],
    } as never;

    const model = buildBoardingCalendarModel({
      facilityRoomIds: facilityIds,
      facilityRooms,
      windowStart: "2026-05-25",
      windowEnd: "2026-05-31",
      unassignedAsOfDate: "2026-05-26",
      bookings: [booking],
      roomAssignments: [
        {
          id: "bra-1",
          booking_id: "b1",
          room_id: "room-a1",
          start_date: "2026-05-26",
          end_date: "2026-05-26",
          rooms: { wing: "back_kennels" },
          bookings: booking,
        } as never,
      ],
    });

    expect(model.assignmentsByRoom.get("room-a1")).toHaveLength(1);
    expect(model.bookingsByRoom.get("room-a1")).toBeUndefined();
    expect(model.unassignedBookings).toHaveLength(0);

    const segments = calendarSegmentsForRoom(model, "room-a1");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("assignment");
  });

  it("lists guest as unassigned on report date when BRA ended before that day", () => {
    const booking = {
      id: "b1",
      booking_type: "boarding",
      room_id: null,
      check_in_date: "2026-05-23",
      check_out_date: "2026-05-28",
      booking_pets: [],
    } as never;

    const model = buildBoardingCalendarModel({
      facilityRoomIds: facilityIds,
      facilityRooms,
      windowStart: "2026-05-25",
      windowEnd: "2026-05-31",
      unassignedAsOfDate: "2026-05-26",
      bookings: [booking],
      roomAssignments: [
        {
          id: "bra-1",
          booking_id: "b1",
          room_id: "room-daycare",
          start_date: "2026-05-23",
          end_date: "2026-05-25",
          rooms: { wing: "back_kennels", room_number: "Daycare 1-1" },
          bookings: booking,
        } as never,
      ],
    });

    expect(model.unassignedBookings).toHaveLength(1);
    const chips = unassignedCalendarSegments(model, booking);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ segStart: "2026-05-26", segEnd: "2026-05-27" });
  });
});
