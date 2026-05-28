import { describe, expect, it } from "vitest";

import { buildPriceMap, daycareHourlyLinearTotal, daycareHourlyPetSubtotal, DAYCARE_HOURLY_UNIT_KEY } from "./servicePricing";

describe("servicePricing", () => {
  it("daycareHourlyLinearTotal multiplies rate × dogs × hours without rounding", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10.5 }]);
    const result = daycareHourlyLinearTotal(2, 1.5, prices);
    expect(result.unitRate).toBe(10.5);
    expect(result.dogHours).toBe(3);
    expect(result.total).toBe(31.5);
    expect(result.label).toContain("1.5 hr");
  });

  it("daycareHourlyPetSubtotal rounds hours to nearest 30 minutes", () => {
    const prices = buildPriceMap([{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: 10 }]);
    expect(daycareHourlyPetSubtotal(1.2, prices).roundedHours).toBe(1);
    expect(daycareHourlyPetSubtotal(1.3, prices).roundedHours).toBe(1.5);
    expect(daycareHourlyPetSubtotal(1.2, prices).total).toBe(10);
    expect(daycareHourlyPetSubtotal(1.3, prices).total).toBe(15);
  });
});
