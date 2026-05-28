import { describe, expect, it } from "vitest";

import {
  composeNotesWithBillingPath,
  composeNotesWithHourlyInvoiced,
  isHourlyBillingInvoiced,
  parseDaycareBillingPath,
  visibleDaycareNotes,
  resolveDaycareSessionInvoiceId,
  isDaycareHourlyPending,
} from "./daycareSessionMeta";

describe("daycareSessionMeta", () => {
  it("parseDaycareBillingPath returns hourly from notes metadata", () => {
    expect(parseDaycareBillingPath("Dog size: Medium\nBILLING_PATH:hourly", null)).toBe("hourly");
  });

  it("parseDaycareBillingPath defaults to single without marker", () => {
    expect(parseDaycareBillingPath("Dog size: Medium", null)).toBe("single");
  });

  it("parseDaycareBillingPath prefers package when package_id set", () => {
    expect(parseDaycareBillingPath("BILLING_PATH:hourly", "pkg-1")).toBe("package");
  });

  it("visibleDaycareNotes strips billing and invoiced metadata", () => {
    expect(
      visibleDaycareNotes("Dog size: Medium\nBILLING_PATH:hourly\nHOURLY_INVOICED:inv-1"),
    ).toBe("Dog size: Medium");
  });

  it("composeNotesWithHourlyInvoiced preserves billing path marker", () => {
    const notes = composeNotesWithHourlyInvoiced("Dog size: Medium\nBILLING_PATH:hourly", "inv-1");
    expect(notes).toContain("BILLING_PATH:hourly");
    expect(notes).toContain("HOURLY_INVOICED:inv-1");
    expect(isHourlyBillingInvoiced(notes)).toBe(true);
  });

  it("resolveDaycareSessionInvoiceId reads hourly family marker from notes", () => {
    const map = new Map<string, string>();
    expect(
      resolveDaycareSessionInvoiceId("sess-2", "BILLING_PATH:hourly\nHOURLY_INVOICED:inv-99", map),
    ).toBe("inv-99");
  });

  it("isDaycareHourlyPending is false once hourly marker is set", () => {
    const map = new Map<string, string>();
    expect(
      isDaycareHourlyPending(
        { sessionId: "s1", notes: "BILLING_PATH:hourly\nHOURLY_INVOICED:inv-1", packageId: null, checkedIn: true },
        map,
      ),
    ).toBe(false);
  });

  it("composeNotesWithBillingPath appends billing marker after visible notes", () => {
    expect(composeNotesWithBillingPath("Dog size: Large", "hourly")).toBe(
      "Dog size: Large\nBILLING_PATH:hourly",
    );
  });
});
