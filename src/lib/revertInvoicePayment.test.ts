import { describe, expect, it } from "vitest";
import { subDays } from "date-fns";
import {
  REVERT_PAYMENT_WINDOW_DAYS,
  canRevertInvoicePayment,
} from "@/lib/revertInvoicePayment";

describe("canRevertInvoicePayment", () => {
  const now = new Date("2026-05-28T12:00:00.000Z");

  it("allows paid invoices within the revert window", () => {
    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: subDays(now, 10).toISOString() },
        [],
        now,
      ),
    ).toBe(true);
  });

  it("blocks paid invoices older than the revert window", () => {
    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: subDays(now, REVERT_PAYMENT_WINDOW_DAYS + 1).toISOString() },
        [],
        now,
      ),
    ).toBe(false);
  });

  it("blocks non-paid invoices", () => {
    expect(
      canRevertInvoicePayment(
        { status: "outstanding", paid_at: subDays(now, 1).toISOString() },
        [],
        now,
      ),
    ).toBe(false);
  });

  it("falls back to latest payment timestamp when paid_at is missing", () => {
    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: null },
        [{ created_at: subDays(now, 3).toISOString(), transaction_type: "deduction" }],
        now,
      ),
    ).toBe(true);

    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: null },
        [{ created_at: subDays(now, 20).toISOString(), transaction_type: "cash_payment" }],
        now,
      ),
    ).toBe(false);
  });

  it("ignores refund rows when inferring paid date", () => {
    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: null },
        [
          { created_at: subDays(now, 1).toISOString(), transaction_type: "refund" },
          { created_at: subDays(now, 20).toISOString(), transaction_type: "deduction" },
        ],
        now,
      ),
    ).toBe(false);
  });

  it("accepts invoices paid exactly on the window boundary", () => {
    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: subDays(now, REVERT_PAYMENT_WINDOW_DAYS).toISOString() },
        [],
        now,
      ),
    ).toBe(true);

    expect(
      canRevertInvoicePayment(
        { status: "paid", paid_at: subDays(now, REVERT_PAYMENT_WINDOW_DAYS + 1).toISOString() },
        [],
        now,
      ),
    ).toBe(false);
  });
});
