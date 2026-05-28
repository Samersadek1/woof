import { describe, expect, it } from "vitest";
import {
  daycarePackageCreditLabel,
  daycarePackageIsExpired,
} from "@/lib/daycarePackageUtils";

describe("daycarePackageUtils", () => {
  it("detects expired packages by date", () => {
    expect(daycarePackageIsExpired("2025-11-24")).toBe(true);
    expect(daycarePackageIsExpired("2099-01-01")).toBe(false);
    expect(daycarePackageIsExpired(null)).toBe(false);
  });

  it("labels expired credits in billing dropdown copy", () => {
    const label = daycarePackageCreditLabel({
      total_days: 14,
      days_used: 10,
      service_code: "daycare_full_day",
      expiry_date: "2025-11-24",
      is_expired: true,
    });
    expect(label).toContain("4 remaining");
    expect(label).toContain("expired");
  });

  it("labels half-day credits in billing dropdown copy", () => {
    const label = daycarePackageCreditLabel({
      total_days: 6,
      days_used: 2,
      service_code: "daycare_half_day",
    });
    expect(label).toContain("4 remaining");
    expect(label).toContain("half-day");
  });
});
