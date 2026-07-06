import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabaseRuntime", () => ({
  getSupabase: () => ({ rpc }),
}));

import { resolveBoardingRate, resolveBoardingStayRates } from "./boardingPricing";

describe("boardingPricing", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "is_peak_date") {
        return { data: args.p_date === "2026-07-15", error: null };
      }
      if (fn === "resolve_woof_service_rate") {
        if (args.p_service_code === "board_and_train_night") {
          return { data: [{ amount_aed: 170 }], error: null };
        }
        const bookingDate = args.p_booking_date as string | undefined;
        const peak = bookingDate === "2026-07-15";
        return { data: [{ amount_aed: peak ? 127.5 : 115.5 }], error: null };
      }
      return { data: null, error: null };
    });
  });

  it("resolveBoardingRate uses RPC amount and peak flag", async () => {
    const peak = await resolveBoardingRate("room-1", 1, { checkInDate: "2026-07-15" });
    expect(peak.unitPrice).toBe(127.5);
    expect(peak.isPeak).toBe(true);
    expect(peak.pricingKey).toBe("boarding_night");

    const off = await resolveBoardingRate("room-1", 1, { checkInDate: "2026-01-10" });
    expect(off.unitPrice).toBe(115.5);
    expect(off.isPeak).toBe(false);
  });

  it("resolveBoardingStayRates multiplies per-pet total across nights", async () => {
    const stay = await resolveBoardingStayRates("room-1", 2, "2026-01-09", "2026-01-11");
    expect(stay.nights).toHaveLength(2);
    expect(stay.totalAed).toBe(115.5 * 2 * 2);
    expect(stay.offPeakNights).toBe(2);
  });

  it("resolveBoardingStayRates uses flat board_and_train rate", async () => {
    const stay = await resolveBoardingStayRates(
      "room-1",
      1,
      "2026-07-15",
      "2026-07-18",
      "board_and_train",
    );
    expect(stay.nights).toHaveLength(3);
    expect(stay.nights.every((n) => n.unitPrice === 170)).toBe(true);
    expect(stay.nights.every((n) => n.pricingKey === "board_and_train_night")).toBe(true);
    expect(stay.totalAed).toBe(170 * 3);
    expect(stay.seasonSummary).toBe("Board & Train — flat rate");
  });

  it("resolveBoardingStayRates falls back to 170 when board_and_train rate card is missing", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "resolve_woof_service_rate" && args.p_service_code === "board_and_train_night") {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    const stay = await resolveBoardingStayRates(
      "room-1",
      2,
      "2026-07-15",
      "2026-07-17",
      "board_and_train",
    );
    expect(stay.totalAed).toBe(170 * 2 * 2);
  });

  it("parses string amount_aed from RPC", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "is_peak_date") return { data: false, error: null };
      if (fn === "resolve_woof_service_rate" && args.p_service_code === "board_and_train_night") {
        return { data: [{ amount_aed: "170.00" }], error: null };
      }
      return { data: [{ amount_aed: "115.50" }], error: null };
    });

    const stay = await resolveBoardingStayRates(
      "room-1",
      1,
      "2026-01-10",
      "2026-01-12",
      "board_and_train",
    );
    expect(stay.nights.every((n) => n.unitPrice === 170)).toBe(true);
  });

  it("resolveBoardingStayRates falls back to 170 when board_and_train RPC fails", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "resolve_woof_service_rate" && args.p_service_code === "board_and_train_night") {
        return { data: null, error: { message: "invalid input value for enum service_code" } };
      }
      return { data: null, error: null };
    });

    const stay = await resolveBoardingStayRates(
      "room-1",
      1,
      "2026-07-15",
      "2026-07-17",
      "board_and_train",
    );
    expect(stay.totalAed).toBe(170 * 2);
  });
});
