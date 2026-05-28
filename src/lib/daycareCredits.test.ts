import { describe, expect, it } from "vitest";
import {
  DAYCARE_CREDIT_CODES,
  daycareCreditTypeLabel,
  isDaycareCreditCode,
} from "@/lib/daycareCredits";

describe("daycareCredits", () => {
  it("includes half-day packages in daycare credit codes", () => {
    expect(DAYCARE_CREDIT_CODES).toContain("daycare_half_day");
  });

  it("labels half-day credits for export and UI", () => {
    expect(daycareCreditTypeLabel("daycare_half_day")).toBe("Half day");
    expect(isDaycareCreditCode("daycare_half_day")).toBe(true);
    expect(isDaycareCreditCode("grooming_splash")).toBe(false);
  });
});
