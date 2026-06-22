import { describe, expect, it } from "vitest";

import {
  clampHeavyDogFeeAed,
  clampMattingFeeAed,
  isGroomingPricingCheckbox,
  resolvePrimaryGroomingCheckbox,
  groomingPricingCheckboxToDbService,
} from "./groomingNewAppointmentPricing";

describe("groomingNewAppointmentPricing", () => {
  it("resolvePrimaryGroomingCheckbox respects base priority", () => {
    expect(resolvePrimaryGroomingCheckbox(["nail_clip", "full_groom"])).toBe("full_groom");
    expect(resolvePrimaryGroomingCheckbox(["bath_only", "deshedding"])).toBe("deshedding");
  });

  it("bath_only + blow_dry combo uses bath_only as primary", () => {
    expect(resolvePrimaryGroomingCheckbox(["bath_only", "blow_dry"])).toBe("bath_only");
  });

  it("addon-only selection uses first selected checkbox as primary", () => {
    expect(resolvePrimaryGroomingCheckbox(["nail_clip"])).toBe("nail_clip");
    expect(resolvePrimaryGroomingCheckbox(["teeth_brushing", "nail_clip"])).toBe("teeth_brushing");
    expect(resolvePrimaryGroomingCheckbox(["malaseb_bath"])).toBe("malaseb_bath");
  });

  it("isGroomingPricingCheckbox guards unknown values", () => {
    expect(isGroomingPricingCheckbox("full_groom")).toBe(true);
    expect(isGroomingPricingCheckbox("not_a_service")).toBe(false);
  });

  it("groomingPricingCheckboxToDbService maps nail_clip to nail_clip service", () => {
    expect(groomingPricingCheckboxToDbService("nail_clip")).toBe("nail_clip");
  });

  it("clampMattingFeeAed respects bounds", () => {
    expect(clampMattingFeeAed(50, { mattingMin: 10, mattingMax: 40 })).toBe(40);
    expect(clampMattingFeeAed(5, { mattingMin: 10, mattingMax: 40 })).toBe(10);
  });

  it("clampHeavyDogFeeAed respects bounds", () => {
    expect(clampHeavyDogFeeAed(100, { heavyMin: 20, heavyMax: 80 })).toBe(80);
  });
});
