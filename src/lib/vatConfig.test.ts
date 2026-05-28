import { describe, expect, it } from "vitest";

import {
  invoiceAmountDue,
  invoiceDisplayTotals,
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
      total_aed: gross,
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
      total_aed: gross,
      vat_aed: null,
      service_type: "package",
    });
    expect(view.grandTotal).toBe(2441.5);
    expect(view.vat).toBe(116.26);
    expect(invoiceAmountDue({
      total: gross,
      total_aed: gross,
      vat_aed: null,
      service_type: "package",
    })).toBe(2441.5);
  });

  it("still adds VAT for legacy boarding rows with null vat_aed", () => {
    const net = 100;
    const view = invoiceDisplayTotals({
      total: net,
      total_aed: net,
      vat_aed: null,
      service_type: "boarding",
    });
    expect(view.grandTotal).toBe(105);
    expect(view.vat).toBe(5);
    expect(treatsStoredTotalAsGrossInclusive({ total: net, total_aed: net, service_type: "boarding" })).toBe(
      false,
    );
  });

  it("legacy daycare package notes imply gross-inclusive when vat_aed is null", () => {
    expect(
      treatsStoredTotalAsGrossInclusive({
        total: 1058.4,
        total_aed: 1058.4,
        notes: "Legacy daycare package purchase | tracker=PKG-92525",
      }),
    ).toBe(true);
  });
});
