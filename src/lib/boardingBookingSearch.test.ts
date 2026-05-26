import { describe, expect, it } from "vitest";
import {
  boardingBookingMatchesSearch,
  boardingBookingSearchActive,
} from "./boardingBookingSearch";

describe("boardingBookingSearch", () => {
  const booking = {
    id: "abc-123",
    booking_ref: "WOOF-2026-00042",
    owners: { first_name: "Jane", last_name: "Smith" },
    rooms: { display_name: "A16", room_number: "A16" },
    booking_pets: [{ pets: { name: "Paddy" } }],
  };

  it("does not filter until query is at least 2 chars", () => {
    expect(boardingBookingSearchActive("a")).toBe(false);
    expect(boardingBookingMatchesSearch(booking, "a")).toBe(true);
    expect(boardingBookingSearchActive("pa")).toBe(true);
  });

  it("matches ref, owner, room, and pet", () => {
    expect(boardingBookingMatchesSearch(booking, "woof-2026")).toBe(true);
    expect(boardingBookingMatchesSearch(booking, "smith")).toBe(true);
    expect(boardingBookingMatchesSearch(booking, "paddy")).toBe(true);
    expect(boardingBookingMatchesSearch(booking, "a16")).toBe(true);
    expect(boardingBookingMatchesSearch(booking, "nomatch")).toBe(false);
  });
});
