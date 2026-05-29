import { describe, expect, it } from "vitest";

import {
  invoiceAdjustmentsForDisplay,
  invoiceAmountDue,
  invoiceDisplayTotals,
  invoiceDiscountPercent,
  invoiceResolvedAmounts,
  invoiceTotalDisplayedDiscount,
  treatsStoredTotalAsGrossInclusive,
  vatAmountFromGrossInclusive,
} from "./vatConfig";

describe("vatConfig", () => {
  it("extracts VAT from a gross-inclusive amount", () => {
    expect(vatAmountFromGrossInclusive(105)).toBe(5);
    expect(vatAmountFromGrossInclusive(2441.5)).toBe(116.26);
  });

  it("does not add VAT on top when vat_aed is set (gross stored)", () => {
    const gross = 63;
    const vat = vatAmountFromGrossInclusive(gross);
    const view = invoiceDisplayTotals({
      total: gross,
      vat_aed: vat,
      service_type: "daycare",
    });
    expect(view.grandTotal).toBe(63);
    expect(view.vat).toBe(3);
    expect(view.netExVat).toBe(60);
  });

  it("treats package invoices with null vat_aed as gross-inclusive (no double VAT)", () => {
    const gross = 2441.5;
    const view = invoiceDisplayTotals({
      total: gross,
      vat_aed: null,
      service_type: "package",
    });
    expect(view.grandTotal).toBe(2441.5);
    expect(view.vat).toBe(116.26);
    expect(invoiceAmountDue({
      total: gross,
      vat_aed: null,
      service_type: "package",
    })).toBe(2441.5);
  });

  it("still adds VAT for legacy boarding rows with null vat_aed", () => {
    const net = 100;
    const view = invoiceDisplayTotals({
      total: net,
      vat_aed: null,
      service_type: "boarding",
    });
    expect(view.grandTotal).toBe(105);
    expect(view.vat).toBe(5);
    expect(treatsStoredTotalAsGrossInclusive({ total: net, service_type: "boarding" })).toBe(
      false,
    );
  });

  it("legacy daycare package notes imply gross-inclusive when vat_aed is null", () => {
    expect(
      treatsStoredTotalAsGrossInclusive({
        total: 1058.4,
        notes: "Legacy daycare package purchase | tracker=PKG-92525",
      }),
    ).toBe(true);
  });

  it("uses post-discount total for grand total after double occupancy", () => {
    const view = invoiceDisplayTotals({
      total: 867,
      vat_aed: 41.29,
      service_type: "boarding",
    });
    expect(view.grandTotal).toBe(867);
    expect(view.vat).toBe(41.29);
    expect(view.netExVat).toBe(825.71);
  });

  it("computes discount percent from subtotal and discount_amount", () => {
    expect(invoiceDiscountPercent({ subtotal: 1020, discount_amount: 153 })).toBe(15);
  });

  it("does not double-count billing adjustments when discount_amount is set", () => {
    const adjustments = [{ adjusted_amount: -153 }];
    expect(
      invoiceTotalDisplayedDiscount({
        discount_amount: 153,
        adjustments,
      }),
    ).toBe(153);
    expect(invoiceAdjustmentsForDisplay(153, adjustments)).toEqual([]);
  });

  it("falls back to adjustment sum when discount_amount is zero", () => {
    const adjustments = [{ adjusted_amount: -50 }];
    expect(
      invoiceTotalDisplayedDiscount({
        discount_amount: 0,
        adjustments,
      }),
    ).toBe(50);
    expect(invoiceAdjustmentsForDisplay(0, adjustments)).toEqual(adjustments);
  });

  it("resolves gross total when adjustments were not synced to the invoice header", () => {
    const resolved = invoiceResolvedAmounts({
      subtotal: 1297.5,
      discount_amount: 0,
      total: 1297.5,
      vat_aed: 61.79,
      service_type: "boarding",
      adjustments: [{ adjusted_amount: 118.13 }],
    });
    expect(resolved.totalDiscount).toBe(118.13);
    expect(resolved.grossTotal).toBe(1179.37);
    expect(resolved.display.grandTotal).toBe(1179.37);
  });
});
