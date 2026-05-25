import { describe, expect, it } from "vitest";

import { isKennelOccupancyRoom } from "./boardingKennelRooms";

describe("isKennelOccupancyRoom", () => {
  it("excludes grooming wing and import placeholders", () => {
    expect(
      isKennelOccupancyRoom({
        is_active: true,
        wing: "grooming_upstairs",
        room_number: "Grooming 1",
        display_name: "Grooming 1",
        notes: null,
      }),
    ).toBe(false);

    expect(
      isKennelOccupancyRoom({
        is_active: true,
        wing: "back_kennels",
        room_number: "UNK-1",
        display_name: "Unknown · Standard",
        notes: null,
      }),
    ).toBe(false);

    expect(
      isKennelOccupancyRoom({
        is_active: true,
        wing: "back_kennels",
        room_number: "A1",
        display_name: "A1",
        notes: null,
      }),
    ).toBe(true);
  });
});
