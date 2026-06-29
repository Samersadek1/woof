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

  it("chains superseded status filters", () => {
    const calls: string[] = [];
    const query = {
      neq: (column: string, value: string) => {
        calls.push(`${column}:${value}`);
        return query;
      },
    };
    withoutSupersededInvoices(query);
    expect(calls).toEqual(["status:voided", "status:consolidated"]);
  });
});
