import { describe, expect, it } from "vitest";
import {
  formatRoomSectionLabel,
  getRoomSectionParts,
  isExcludedBoardingRoom,
  parseRoomSectionAndNumber,
  roomNameForSectionParse,
} from "./boardingRoomSections";

describe("boardingRoomSections", () => {
  it("parses letter section + trailing room number", () => {
    expect(parseRoomSectionAndNumber("A1")).toEqual({ section: "A", roomNumber: "1" });
    expect(parseRoomSectionAndNumber("Dcare2b2")).toEqual({
      section: "Dcare2b",
      roomNumber: "2",
    });
  });

  it("uses display_name when room_number is numeric-only", () => {
    const label = roomNameForSectionParse({
      room_number: "3",
      display_name: "Oxford Street 3",
    });
    expect(label).toBe("Oxford Street 3");
    expect(getRoomSectionParts({ room_number: "3", display_name: "Oxford Street 3" })).toMatchObject({
      section: "Oxford Street",
      roomNumber: "3",
    });
  });

  it("excludes F100 and D100", () => {
    expect(isExcludedBoardingRoom({ room_number: "F100", display_name: "F100" })).toBe(true);
    expect(isExcludedBoardingRoom({ room_number: "D100", display_name: "D100" })).toBe(true);
    expect(isExcludedBoardingRoom({ room_number: "A1", display_name: "A1" })).toBe(false);
  });

  it("formats section labels for display", () => {
    expect(
      formatRoomSectionLabel({ room_number: "Dcare2b2", display_name: "Dcare2b2" }),
    ).toBe("Dcare2b 2");
  });
});
