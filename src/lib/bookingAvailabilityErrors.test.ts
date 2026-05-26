import { describe, expect, it } from "vitest";
import {
  BOOKING_ROOM_OVERLAP_TOKEN,
  extractErrorMessage,
  getBookingRoomOverlapErrorMessage,
  isBookingRoomOverlapError,
} from "./bookingAvailabilityErrors";

describe("booking availability error mapping", () => {
  it("detects overlap conflict by deterministic DB token in message", () => {
    const err = { message: BOOKING_ROOM_OVERLAP_TOKEN };
    expect(isBookingRoomOverlapError(err)).toBe(true);
    expect(getBookingRoomOverlapErrorMessage(err)).toBe(
      "This room is already booked for these dates by another owner. Choose another room or adjust dates."
    );
  });

  it("detects overlap conflict when token appears in details", () => {
    const err = { message: "check violation", details: `Violation: ${BOOKING_ROOM_OVERLAP_TOKEN}` };
    expect(isBookingRoomOverlapError(err)).toBe(true);
  });

  it("returns null message for regular booking errors", () => {
    const err = { message: "Pet has not passed behavioural assessment" };
    expect(isBookingRoomOverlapError(err)).toBe(false);
    expect(getBookingRoomOverlapErrorMessage(err)).toBeNull();
  });

  it("returns null for non-object errors", () => {
    expect(isBookingRoomOverlapError("boom")).toBe(false);
    expect(getBookingRoomOverlapErrorMessage("boom")).toBeNull();
  });

  it("extractErrorMessage reads Supabase-style error objects", () => {
    expect(
      extractErrorMessage({
        message: "Pet Alfie has not passed behavioural assessment (status=not_assessed).",
        code: "23514",
      }),
    ).toBe("Pet Alfie has not passed behavioural assessment (status=not_assessed).");
    expect(extractErrorMessage({ details: "Room conflict" })).toBe("Room conflict");
    expect(extractErrorMessage("plain error")).toBe("plain error");
    expect(extractErrorMessage(null)).toBe("Something went wrong");
  });
});
