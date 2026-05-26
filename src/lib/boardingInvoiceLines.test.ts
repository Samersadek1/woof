import { describe, expect, it } from "vitest";

import {
  deriveInvoiceStatusAfterRecalc,
  isBoardingNightLineItem,
} from "./boardingInvoiceLineUtils";

describe("boardingInvoiceLines", () => {
  it("isBoardingNightLineItem matches boarding night rows only", () => {
    expect(
      isBoardingNightLineItem({
        service_type: "boarding",
        description: "A12 — Boarding — 3 off-peak nights",
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
