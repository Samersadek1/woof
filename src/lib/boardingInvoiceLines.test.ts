import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBoardingNightLineItems,
  deriveInvoiceStatusAfterRecalc,
  isBoardingNightLineItem,
} from "./boardingInvoiceLines";

vi.mock("@/lib/boardingPricing", () => ({
  resolveBoardingStayRates: vi.fn(),
}));

import { resolveBoardingStayRates } from "@/lib/boardingPricing";

const mockedResolveBoardingStayRates = vi.mocked(resolveBoardingStayRates);

describe("boardingInvoiceLines", () => {
  it("isBoardingNightLineItem matches boarding night rows only", () => {
    expect(
      isBoardingNightLineItem({
        service_type: "boarding",
        description: "Max — A12 — Boarding — Off-peak — 1 Dec – 3 Dec 2025 (3 nights)",
        pricing_key: "boarding_night",
      }),
    ).toBe(true);
    expect(
      isBoardingNightLineItem({
        service_type: "boarding",
        description: "Pickup — Dubai",
        pricing_key: "transport_dubai",
      }),
    ).toBe(false);
  });

  it("deriveInvoiceStatusAfterRecalc respects partial payments", () => {
    expect(deriveInvoiceStatusAfterRecalc("outstanding", 500, 1000)).toBe("partially_paid");
    expect(deriveInvoiceStatusAfterRecalc("partially_paid", 500, 1000)).toBe("partially_paid");
    expect(deriveInvoiceStatusAfterRecalc("paid", 1000, 800)).toBe("paid");
    expect(deriveInvoiceStatusAfterRecalc("paid", 0, 1000)).toBe("outstanding");
    expect(deriveInvoiceStatusAfterRecalc("overdue", 200, 1000)).toBe("overdue");
  });
});

describe("buildBoardingNightLineItems", () => {
  beforeEach(() => {
    mockedResolveBoardingStayRates.mockReset();
  });

  it("creates per-pet lines with date ranges for each contiguous season run", async () => {
    mockedResolveBoardingStayRates.mockResolvedValue({
      nights: [
        { date: "2025-12-01", unitPrice: 115.5, pricingKey: "boarding_night", season: "off_peak", isPeak: false },
        { date: "2025-12-02", unitPrice: 115.5, pricingKey: "boarding_night", season: "off_peak", isPeak: false },
        { date: "2025-12-03", unitPrice: 115.5, pricingKey: "boarding_night", season: "off_peak", isPeak: false },
        { date: "2025-12-04", unitPrice: 127.5, pricingKey: "boarding_night", season: "peak", isPeak: true },
        { date: "2025-12-05", unitPrice: 127.5, pricingKey: "boarding_night", season: "peak", isPeak: true },
      ],
      totalAed: 486,
      peakNights: 2,
      offPeakNights: 3,
      seasonSummary: "Mixed (2 peak, 3 off-peak)",
    });

    const lines = await buildBoardingNightLineItems({
      roomId: "room-1",
      roomName: "A12",
      petCount: 2,
      pets: [
        { id: "pet-max", name: "Max" },
        { id: "pet-buddy", name: "Buddy" },
      ],
      checkInDate: "2025-12-01",
      checkOutDate: "2025-12-06",
    });

    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      description: "Max — A12 — Boarding — Off-peak — 1 Dec – 3 Dec 2025 (3 nights)",
      quantity: 3,
      unitPrice: 115.5,
      pricingKey: "boarding_night",
      serviceType: "boarding",
    });
    expect(lines[1]).toMatchObject({
      description: "Max — A12 — Boarding — Peak — 4 Dec – 5 Dec 2025 (2 nights)",
      quantity: 2,
      unitPrice: 127.5,
    });
    expect(lines[2].description).toBe("Buddy — A12 — Boarding — Off-peak — 1 Dec – 3 Dec 2025 (3 nights)");
    expect(lines[3].description).toBe("Buddy — A12 — Boarding — Peak — 4 Dec – 5 Dec 2025 (2 nights)");
  });

  it("uses a single-date label for one-night runs", async () => {
    mockedResolveBoardingStayRates.mockResolvedValue({
      nights: [
        { date: "2025-12-04", unitPrice: 127.5, pricingKey: "boarding_night", season: "peak", isPeak: true },
      ],
      totalAed: 127.5,
      peakNights: 1,
      offPeakNights: 0,
      seasonSummary: "Peak",
    });

    const lines = await buildBoardingNightLineItems({
      roomId: null,
      petCount: 1,
      pets: [{ id: "pet-max", name: "Max" }],
      checkInDate: "2025-12-04",
      checkOutDate: "2025-12-05",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Max — Boarding — Peak — 4 Dec 2025 (1 night)");
  });
});
