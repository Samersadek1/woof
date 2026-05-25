import { describe, expect, it } from "vitest";

import {
  buildBoardingCalendarModel,
  calendarSegmentsForRoom,
} from "./boardingCalendarModel";

describe("buildBoardingCalendarModel", () => {
  const facilityIds = new Set(["room-a1", "room-b1"]);

  it("puts bookings without segments in unassigned when no room_id", () => {
    const model = buildBoardingCalendarModel({
      facilityRoomIds: facilityIds,
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
      room_id: "room-b1",
      check_in_date: "2026-05-26",
      check_out_date: "2026-05-28",
      booking_pets: [],
    } as never;

    const model = buildBoardingCalendarModel({
      facilityRoomIds: facilityIds,
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
    expect(model.bookingsByRoom.get("room-b1")).toBeUndefined();
    expect(model.unassignedBookings).toHaveLength(0);

    const segments = calendarSegmentsForRoom(model, "room-a1");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("assignment");
  });
});
