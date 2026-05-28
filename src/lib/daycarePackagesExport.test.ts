import { describe, expect, it } from "vitest";

import { daycarePackagesExportRows } from "./daycarePackagesExport";
import type { PackageWithDetails } from "@/hooks/useDaycare";

describe("daycarePackagesExportRows", () => {
  it("maps utilization fields from package credits", () => {
    const pkg = {
      id: "credit-1",
      owner_id: "owner-1",
      pet_id: "pet-1",
      total_days: 10,
      days_used: 4,
      expiry_date: "2026-12-31",
      purchase_date: "2026-01-15T10:00:00Z",
      package_name: "10-day package",
      service_code: "daycare_full_day",
      is_bonus: false,
      status: "active",
      units_remaining: 6,
      is_expired: false,
      source_ref_id: null,
      redemption_group_id: null,
      pets: { name: "Paddy" },
      owners: {
        first_name: "Jane",
        last_name: "Smith",
        is_elite: false,
        is_vip: true,
        member_tier: "silver",
      },
    } satisfies PackageWithDetails;

    const [row] = daycarePackagesExportRows([pkg]);
    expect(row["Days used"]).toBe(4);
    expect(row["Total days"]).toBe(10);
    expect(row["Days remaining"]).toBe(6);
    expect(row["Utilization %"]).toBe(40);
    expect(row.Owner).toBe("Jane Smith");
    expect(row.Pet).toBe("Paddy");
  });
});
