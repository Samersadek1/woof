import { describe, expect, it } from "vitest";
import { formatCreditGrant, formatPackageIncludes } from "./packageCatalog";

describe("packageCatalog", () => {
  it("formats credit grants for display", () => {
    expect(
      formatCreditGrant({
        service_code: "grooming_splash",
        units: 6,
        is_bonus: false,
      }),
    ).toBe("6 Splash sessions");

    expect(
      formatCreditGrant({
        service_code: "grooming_full_service",
        units: 1,
        is_bonus: true,
      }),
    ).toBe("+ 1 Full Service session (bonus)");
  });

  it("joins package includes in sort order", () => {
    expect(
      formatPackageIncludes([
        {
          id: "1",
          package_def_id: "pkg",
          service_code: "grooming_full_service",
          units: 6,
          is_bonus: false,
          exclusive_group: null,
          sort_order: 10,
        },
        {
          id: "2",
          package_def_id: "pkg",
          service_code: "daycare_full_day",
          units: 2,
          is_bonus: true,
          exclusive_group: null,
          sort_order: 20,
        },
      ]),
    ).toBe("6 Full Service sessions · + 2 Full Daycare Day sessions (bonus)");
  });
});
