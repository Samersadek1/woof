import { describe, expect, it } from "vitest";

import { buildPriceMap, daycareHourlyLinearTotal, DAYCARE_HOURLY_UNIT_KEY } from "./servicePricing";

describe("servicePricing", () => {
  it("daycareHourlyLinearTotal multiplies rate × dogs × hours without rounding", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10.5 }]);
    const result = daycareHourlyLinearTotal(2, 1.5, prices);
    expect(result.unitRate).toBe(10.5);
    expect(result.dogHours).toBe(3);
    expect(result.total).toBe(31.5);
    expect(result.label).toContain("1.5 hr");
  });

  it("daycareHourlyLinearTotal supports fractional dog-hours on invoice quantity", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10.5 }]);
    const { unitRate, dogHours, total } = daycareHourlyLinearTotal(1, 2.5, prices);
    expect(unitRate * dogHours).toBe(total);
    expect(total).toBe(26.25);
  });
});
