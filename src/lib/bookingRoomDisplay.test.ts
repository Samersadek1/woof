import { describe, expect, it } from "vitest";

import {
  assignmentCoversDate,
  formatRoomAssignmentsSummary,
  roomAssignmentForDate,
  roomLabelForBooking,
} from "./bookingRoomDisplay";

describe("bookingRoomDisplay", () => {
  const slices = [
    { start_date: "2027-05-23", end_date: "2027-05-23", rooms: { room_number: "B2", display_name: "B2", cam_id: null } },
    { start_date: "2027-05-24", end_date: "2027-05-25", rooms: { room_number: "A16", display_name: "A16", cam_id: null } },
  ];

  it("assignmentCoversDate is inclusive on end_date", () => {
    expect(assignmentCoversDate(slices[0], "2027-05-23")).toBe(true);
    expect(assignmentCoversDate(slices[0], "2027-05-24")).toBe(false);
    expect(assignmentCoversDate(slices[1], "2027-05-25")).toBe(true);
  });

  it("roomAssignmentForDate picks the segment for that day", () => {
    expect(roomAssignmentForDate(slices, "2027-05-24")?.rooms?.room_number).toBe("A16");
    expect(roomAssignmentForDate(slices, "2027-05-23")?.rooms?.room_number).toBe("B2");
  });

  it("roomLabelForBooking prefers assignment on asOfDate over booking.room_id", () => {
    expect(
      roomLabelForBooking(
        {
          check_in_date: "2027-05-23",
          rooms: { room_number: "UNK-1", display_name: "Unknown · Standard", cam_id: null },
        },
        slices,
        { asOfDate: "2027-05-24" },
      ),
    ).toBe("A16");
  });

  it("formatRoomAssignmentsSummary lists segments", () => {
    expect(formatRoomAssignmentsSummary(slices, { highlightDate: "2027-05-24" })).toEqual([
      "B2: 2027-05-23",
      "A16: 2027-05-24 – 2027-05-25 (this day)",
    ]);
  });
});
