import { describe, expect, it } from "vitest";
import {
  invoiceBalanceDue,
  isInactiveInvoiceStatus,
  withoutSupersededInvoices,
} from "@/lib/invoiceStatus";

describe("invoiceStatus", () => {
  it("treats consolidated as inactive", () => {
    expect(isInactiveInvoiceStatus("consolidated")).toBe(true);
  });

  it("returns zero balance for consolidated invoices", () => {
    expect(invoiceBalanceDue("consolidated", 500, 0)).toBe(0);
    expect(invoiceBalanceDue("consolidated", 500, 100)).toBe(0);
  });

  it("computes balance for open invoices", () => {
    expect(invoiceBalanceDue("outstanding", 500, 100)).toBe(400);
  });

  it("deducts opening_balance (deposit) from outstanding", () => {
    // INV-2026-06763-shaped: 5694.15 - 2847.50 - 1517.25 = 1329.40
    expect(invoiceBalanceDue("partially_paid", 5694.15, 2847.5, 1517.25)).toBe(1329.4);
    expect(invoiceBalanceDue("outstanding", 500, 0, 150)).toBe(350);
    expect(invoiceBalanceDue("outstanding", 500, 400, 200)).toBe(0);
  });

  it("chains superseded status filters", () => {
    const calls: string[] = [];
    const query = {
      not: (column: string, operator: string, value: string) => {
        calls.push(`${column}.${operator}.${value}`);
        return query;
      },
    };
    withoutSupersededInvoices(query);
    expect(calls).toEqual(["status.in.(voided,consolidated)"]);
  });
});
