import { describe, expect, it } from "vitest";
import {
  bookingOverlapsSegmentWindow,
  getBookingRoomForDate,
  getSegmentForDate,
} from "./bookingRoomSegments";

const slices = [
  { start_date: "2027-05-23", end_date: "2027-05-23", rooms: { room_number: "B2", display_name: "B2", cam_id: null } },
  { start_date: "2027-05-24", end_date: "2027-05-25", rooms: { room_number: "A16", display_name: "A16", cam_id: null } },
];

describe("bookingRoomSegments", () => {
  it("getSegmentForDate delegates to assignment helper", () => {
    expect(getSegmentForDate(slices, "2027-05-24")?.rooms?.room_number).toBe("A16");
  });

  it("getBookingRoomForDate prefers segment room", () => {
    const room = getBookingRoomForDate(
      {
        room_id: "legacy",
        rooms: { room_number: "LEG", display_name: "Legacy", cam_id: null } as never,
        check_in_date: "2027-05-23",
      },
      slices,
      "2027-05-24",
    );
    expect(room?.room_number).toBe("A16");
  });

  it("bookingOverlapsSegmentWindow detects overlap", () => {
    expect(
      bookingOverlapsSegmentWindow(
        { check_in_date: "2027-05-20", check_out_date: "2027-05-26" },
        { start_date: "2027-05-24", end_date: "2027-05-25" },
      ),
    ).toBe(true);
    expect(
      bookingOverlapsSegmentWindow(
        { check_in_date: "2027-05-01", check_out_date: "2027-05-10" },
        { start_date: "2027-05-24", end_date: "2027-05-25" },
      ),
    ).toBe(false);
  });
});
