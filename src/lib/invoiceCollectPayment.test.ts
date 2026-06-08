import { describe, expect, it } from "vitest";
import {
  canCollectInvoicePayment,
  invoiceBalanceDue,
  isLegacyImportPaidStatusMismatch,
} from "./invoiceCollectPayment";

describe("invoiceCollectPayment", () => {
  it("allows payment on paid status when balance remains", () => {
    expect(canCollectInvoicePayment("paid", 1176)).toBe(true);
  });

  it("blocks payment on voided and draft invoices", () => {
    expect(canCollectInvoicePayment("voided", 100)).toBe(false);
    expect(canCollectInvoicePayment("draft", 100)).toBe(false);
  });

  it("blocks payment when fully settled", () => {
    expect(canCollectInvoicePayment("outstanding", 0)).toBe(false);
    expect(canCollectInvoicePayment("paid", 0)).toBe(false);
  });

  it("invoiceBalanceDue respects legacy package gross totals", () => {
    expect(
      invoiceBalanceDue({
        total: 1176,
        vat_aed: null,
        service_type: null,
        notes: "Legacy daycare package purchase | tracker=PKG-92407",
        amount_paid: 0,
      }),
    ).toBe(1176);
  });

  it("detects legacy import paid-status mismatch", () => {
    expect(
      isLegacyImportPaidStatusMismatch(
        "Legacy daycare package purchase | tracker=PKG-92407",
        "paid",
        1176,
      ),
    ).toBe(true);
    expect(isLegacyImportPaidStatusMismatch("Boarding stay", "paid", 1176)).toBe(false);
  });
});
