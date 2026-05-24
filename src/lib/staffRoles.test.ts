import { describe, expect, it } from "vitest";
import {
  normalizeStaffRole,
  staffMatchesSearch,
  staffRoleLabel,
} from "./staffRoles";

describe("staffRoles", () => {
  it("normalizes unknown roles for Select values", () => {
    expect(normalizeStaffRole("legacy_role")).toBe("booking_coordinator");
    expect(normalizeStaffRole("admin")).toBe("admin");
  });

  it("labels unknown roles without crashing", () => {
    expect(staffRoleLabel("legacy_role")).toBe("legacy role");
    expect(staffRoleLabel("admin")).toBe("Admin");
  });

  it("filters staff rows client-side", () => {
    const row = {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@woof.ae",
      phone: null,
    };
    expect(staffMatchesSearch(row, "jane@")).toBe(true);
    expect(staffMatchesSearch(row, "nomatch")).toBe(false);
  });
});
