import { describe, expect, it } from "vitest";
import {
  activeLinkedStayLabel,
  formatGroomingBookingLinkPets,
  groomingStayCoversDate,
  isGroomingLinkableToBooking,
  mergeGroomingBookingLinkHits,
  groomingBookingLinkPetIds,
  type GroomingBookingLinkHit,
} from "./groomingBookingLinkSearch";

const hit = (id: string, petIds: string[]): GroomingBookingLinkHit => ({
  id,
  booking_ref: `WOOF-2026-${id}`,
  owner_id: "owner-1",
  booking_type: "boarding",
  check_in_date: "2026-05-28",
  check_out_date: "2026-05-30",
  status: "confirmed",
  owners: { first_name: "Jane", last_name: "Doe", phone: "+971500000000" },
  booking_pets: petIds.map((pet_id, i) => ({
    pet_id,
    pets: { name: `Pet${i + 1}` },
  })),
});

describe("groomingBookingLinkSearch", () => {
  it("mergeGroomingBookingLinkHits dedupes by id", () => {
    const a = hit("a", ["p1"]);
    const b = hit("b", ["p2"]);
    const merged = mergeGroomingBookingLinkHits([a], [a, b]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("groomingBookingLinkPetIds returns pet ids", () => {
    expect(groomingBookingLinkPetIds(hit("x", ["p1", "p2"]))).toEqual(["p1", "p2"]);
  });

  it("formatGroomingBookingLinkPets joins names", () => {
    expect(formatGroomingBookingLinkPets(hit("x", ["p1", "p2"]))).toBe("Pet1, Pet2");
  });

  it("groomingStayCoversDate includes boarding checkout day", () => {
    const booking = {
      booking_type: "boarding" as const,
      check_in_date: "2026-05-28",
      check_out_date: "2026-05-30",
    };
    expect(groomingStayCoversDate(booking, "2026-05-29")).toBe(true);
    expect(groomingStayCoversDate(booking, "2026-05-30")).toBe(true);
    expect(groomingStayCoversDate(booking, "2026-05-31")).toBe(false);
  });

  it("isGroomingLinkableToBooking rejects inactive stays", () => {
    const booking = hit("x", ["p1"]);
    expect(isGroomingLinkableToBooking({ ...booking, status: "checked_out" }, "2026-05-29")).toBe(
      false,
    );
    expect(isGroomingLinkableToBooking(booking, "2026-05-29")).toBe(true);
  });

  it("activeLinkedStayLabel requires overlap and active status", () => {
    const booking = hit("x", ["p1"]);
    expect(activeLinkedStayLabel(booking, "2026-05-29")).toMatch(/Boarding/);
    expect(activeLinkedStayLabel({ ...booking, status: "checked_out" }, "2026-05-29")).toBeNull();
    expect(activeLinkedStayLabel(booking, "2026-06-01")).toBeNull();
  });
});
