import { describe, expect, it } from "vitest";

import {
  billableDaycareHourlyHours,
  buildPriceMap,
  daycareHourlyInvoiceLineUnits,
  daycareHourlyLinearTotal,
  daycareHourlyPetSubtotal,
  DAYCARE_HOURLY_UNIT_KEY,
} from "./servicePricing";

describe("servicePricing", () => {
  describe("billableDaycareHourlyHours", () => {
    it("bills first 30 minutes as half hour", () => {
      expect(billableDaycareHourlyHours(0.25)).toBe(0.5);
      expect(billableDaycareHourlyHours(0.5)).toBe(0.5);
    });

    it("bills after 30 minutes as a full hour", () => {
      expect(billableDaycareHourlyHours(31 / 60)).toBe(1);
      expect(billableDaycareHourlyHours(0.75)).toBe(1);
    });

    it("applies block rules to partial hours beyond the first", () => {
      expect(billableDaycareHourlyHours(1.2)).toBe(1.5);
      expect(billableDaycareHourlyHours(1.6)).toBe(2);
    });
  });

  it("daycareHourlyLinearTotal uses block billing before multiplying by dogs", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10.5 }]);
    const result = daycareHourlyLinearTotal(2, 1.3, prices);
    expect(result.unitRate).toBe(10.5);
    expect(result.roundedHours).toBe(1.5);
    expect(result.dogHours).toBe(3);
    expect(result.total).toBe(31.5);
    expect(result.label).toContain("1.5 hr");
  });

  it("daycareHourlyInvoiceLineUnits stores integer 30-minute slots", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10.5 }]);
    const { unitRate } = daycareHourlyPetSubtotal(6.5, prices);
    const line = daycareHourlyInvoiceLineUnits(6.5, unitRate);
    expect(line.roundedHours).toBe(6.5);
    expect(line.quantity).toBe(13);
    expect(line.unitPrice).toBe(5.25);
    expect(line.lineTotal).toBe(68.25);
    expect(Number.isInteger(line.quantity)).toBe(true);
  });

  it("daycareHourlyPetSubtotal applies block billing to totals", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10 }]);
    expect(daycareHourlyPetSubtotal(0.25, prices).roundedHours).toBe(0.5);
    expect(daycareHourlyPetSubtotal(0.25, prices).total).toBe(5);
    expect(daycareHourlyPetSubtotal(31 / 60, prices).roundedHours).toBe(1);
    expect(daycareHourlyPetSubtotal(31 / 60, prices).total).toBe(10);
  });
});
