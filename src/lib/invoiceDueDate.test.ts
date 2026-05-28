import { describe, expect, it } from "vitest";

import { invoiceDueDateAtCheckIn, invoiceDueDateToday } from "@/lib/invoiceDueDate";

describe("invoiceDueDate", () => {
  it("uses the calendar check-in date from ISO timestamps", () => {
    expect(invoiceDueDateAtCheckIn("2026-03-16T14:30:00+04:00")).toBe("2026-03-16");
    expect(invoiceDueDateAtCheckIn("2026-03-16")).toBe("2026-03-16");
  });

  it("defaults walk-in due dates to today", () => {
    expect(invoiceDueDateToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
