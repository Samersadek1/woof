import { describe, expect, it } from "vitest";

import {
  defaultPeakPeriodLabel,
  formatPeakPeriodRange,
  validatePeakPeriodInput,
} from "./peakPeriods";

describe("peakPeriods", () => {
  it("validates date order", () => {
    expect(validatePeakPeriodInput({ startDate: "2026-05-20", endDate: "2026-05-19" })).toEqual({
      ok: false,
      message: "End date must be on or after the start date.",
    });
    expect(validatePeakPeriodInput({ startDate: "2026-05-19", endDate: "2026-05-29" })).toEqual({
      ok: true,
    });
  });

  it("formats single-day and cross-year ranges", () => {
    expect(formatPeakPeriodRange("2026-05-19", "2026-05-19")).toBe("19 May 2026");
    expect(formatPeakPeriodRange("2026-05-19", "2026-05-29")).toBe("19 May – 29 May 2026");
    expect(formatPeakPeriodRange("2026-12-20", "2027-01-08")).toBe("20 Dec 2026 – 8 Jan 2027");
  });

  it("defaultPeakPeriodLabel matches range format", () => {
    expect(defaultPeakPeriodLabel("2026-07-01", "2026-08-31")).toBe(
      formatPeakPeriodRange("2026-07-01", "2026-08-31"),
    );
  });
});
