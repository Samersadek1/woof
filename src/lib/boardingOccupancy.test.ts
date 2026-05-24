import { describe, expect, it } from "vitest";

import type { Database } from "@/integrations/supabase/types";

import { computeBoardingOccupancyStats } from "./boardingOccupancy";
import type { OccupancyAssignmentRow } from "./boardingOccupancy";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

const a1: Room = {
  id: "room-a1",
  room_number: "A1",
  display_name: "A1",
  wing: "back_kennels",
  room_type: "standard",
  is_active: true,
  cam_id: null,
  created_at: "",
  updated_at: "",
};

const grooming: Room = {
  id: "room-groom",
  room_number: "Grooming 1",
  display_name: "Grooming 1",
  wing: "grooming_upstairs",
  room_type: "grooming",
  is_active: true,
  cam_id: null,
  created_at: "",
  updated_at: "",
};

const placeholder: Room = {
  id: "room-unk",
  room_number: "UNK-1",
  display_name: "Unknown · Standard",
  wing: "back_kennels",
  room_type: "standard",
  is_active: true,
  cam_id: null,
  created_at: "",
  updated_at: "",
};

type TestBooking = OccupancyAssignmentRow["bookings"];

function booking(overrides: Partial<TestBooking> & { id: string }): TestBooking {
  return {
    id: overrides.id,
    booking_ref: overrides.booking_ref ?? overrides.id,
    check_in_date: overrides.check_in_date ?? "2026-05-26",
    check_out_date: overrides.check_out_date ?? "2026-05-28",
    room_id: overrides.room_id ?? null,
    status: overrides.status ?? "confirmed",
    booking_type: "boarding",
    booking_pets: overrides.booking_pets ?? [],
    owners: overrides.owners ?? null,
  } as TestBooking;
}

const noExclude = () => false;

describe("computeBoardingOccupancyStats", () => {
  it("counts guests without a kennel room as unassigned", () => {
    const stats = computeBoardingOccupancyStats({
      asOfDate: "2026-05-26",
      facilityRooms: [a1, grooming],
      bookings: [booking({ id: "b1" })],
      assignments: [],
      isExcludedBoardingRoom: noExclude,
    });

    expect(stats.roomOccupiedCount).toBe(0);
    expect(stats.unassignedGuestCount).toBe(1);
    expect(stats.occupiedCount).toBe(1);
    expect(stats.availableCount).toBe(0);
    expect(stats.pct).toBe(100);
    expect(stats.unassignedGuests).toHaveLength(1);
  });

  it("uses pool room assignment on date instead of stale room_id", () => {
    const stats = computeBoardingOccupancyStats({
      asOfDate: "2026-05-26",
      facilityRooms: [a1, grooming],
      bookings: [booking({ id: "b1", room_id: grooming.id })],
      assignments: [
        {
          booking_id: "b1",
          room_id: a1.id,
          start_date: "2026-05-26",
          end_date: "2026-05-26",
          bookings: booking({ id: "b1" }),
        },
      ],
      isExcludedBoardingRoom: noExclude,
    });

    expect(stats.roomOccupiedCount).toBe(1);
    expect(stats.unassignedGuestCount).toBe(0);
    expect(stats.byGroup.get("A")?.occupied).toHaveLength(1);
  });

  it("counts grooming-only assignment as unassigned for kennel occupancy", () => {
    const stats = computeBoardingOccupancyStats({
      asOfDate: "2026-05-26",
      facilityRooms: [a1, grooming],
      bookings: [booking({ id: "b1" })],
      assignments: [
        {
          booking_id: "b1",
          room_id: grooming.id,
          start_date: "2026-05-26",
          end_date: "2026-05-26",
          bookings: booking({ id: "b1" }),
        },
      ],
      isExcludedBoardingRoom: noExclude,
    });

    expect(stats.roomOccupiedCount).toBe(0);
    expect(stats.unassignedGuestCount).toBe(1);
    expect(stats.occupiedCount).toBe(1);
  });

  it("tracks import placeholders separately from unassigned guests", () => {
    const stats = computeBoardingOccupancyStats({
      asOfDate: "2026-05-26",
      facilityRooms: [a1, placeholder],
      bookings: [
        booking({ id: "b1" }),
        booking({ id: "b2", check_in_date: "2026-05-26", check_out_date: "2026-05-27" }),
      ],
      assignments: [
        {
          booking_id: "b1",
          room_id: placeholder.id,
          start_date: "2026-05-26",
          end_date: "2026-05-26",
          bookings: booking({ id: "b1" }),
        },
      ],
      isExcludedBoardingRoom: noExclude,
    });

    expect(stats.importedUnassignedCount).toBe(1);
    expect(stats.unassignedGuestCount).toBe(1);
    expect(stats.occupiedCount).toBe(1);
    expect(stats.roomOccupiedCount).toBe(0);
  });
});
