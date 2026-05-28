import { describe, expect, it } from "vitest";
import { MAX_BOARDING_STAY_NIGHTS, validateBoardingDateRange } from "@/lib/bookingUtils";

describe("validateBoardingDateRange", () => {
  it("rejects check-out on or before check-in", () => {
    expect(validateBoardingDateRange("2026-05-10", "2026-05-10")).toMatch(/after check-in/);
    expect(validateBoardingDateRange("2026-05-12", "2026-05-10")).toMatch(/after check-in/);
  });

  it("rejects stays longer than the max night cap", () => {
    const checkIn = "2026-01-01";
    const checkOut = `20${26 + 1}-01-01`;
    const nights = 366 + 1;
    const farOut = new Date(`${checkIn}T12:00:00`);
    farOut.setDate(farOut.getDate() + nights);
    const checkOutIso = farOut.toISOString().slice(0, 10);
    expect(validateBoardingDateRange(checkIn, checkOutIso)).toContain(
      String(MAX_BOARDING_STAY_NIGHTS),
    );
  });

  it("accepts a normal short stay", () => {
    expect(validateBoardingDateRange("2026-05-29", "2026-05-30")).toBeNull();
  });
});
