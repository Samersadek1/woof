/**
 * UAE VAT rate for service invoices. Update here only — UI and invoice math import this.
 */
export const VAT_RATE = 0.05 as const;

export const VAT_PERCENT_LABEL = `${VAT_RATE * 100}%`;

/** Catalog prices for these services are VAT-inclusive (amount charged = gross). */
export const GROSS_INCLUSIVE_SERVICE_TYPES = ["package", "daycare"] as const;

/** User-facing label for invoice lines, e.g. "VAT (5%)". */
export function vatLineLabel(): string {
  return `VAT (${VAT_PERCENT_LABEL})`;
}

export function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** VAT amount when prices are VAT-inclusive gross values. */
export function vatAmountFromGrossInclusive(grossInclusive: number): number {
  const gross = Math.max(0, grossInclusive);
  return roundMoney2(gross - gross / (1 + VAT_RATE));
}

/** Net ex-VAT amount from a VAT-inclusive gross value. */
export function netFromGrossInclusive(grossInclusive: number): number {
  const gross = Math.max(0, grossInclusive);
  return roundMoney2(gross - vatAmountFromGrossInclusive(gross));
}

/** VAT amount on a net (ex-VAT) total after discounts. */
export function vatAmountFromNet(netAfterDiscount: number): number {
  return roundMoney2(Math.max(0, netAfterDiscount) * VAT_RATE);
}

/** Gross total (incl. VAT) from net after discounts. */
export function grandTotalFromNet(netAfterDiscount: number): number {
  const net = Math.max(0, netAfterDiscount);
  return roundMoney2(net + vatAmountFromNet(net));
}

export function isGrossInclusiveServiceType(serviceType: string | null | undefined): boolean {
  return (
    serviceType != null &&
    (GROSS_INCLUSIVE_SERVICE_TYPES as readonly string[]).includes(serviceType)
  );
}

export function isLegacyDaycarePackageInvoice(notes: string | null | undefined): boolean {
  return (notes ?? "").includes("Legacy daycare package purchase");
}

export type InvoiceVatInput = {
  total: number;
  /**
   * When set (incl. 0), `total` is gross incl. VAT.
   * When null, legacy boarding may be ex-VAT; package/daycare still treated as gross via `service_type` / `notes`.
   */
  vat_aed?: number | null;
  service_type?: string | null;
  notes?: string | null;
};

function storedInvoiceAmount(inv: InvoiceVatInput): number {
  return roundMoney2(Math.max(0, inv.total ?? 0));
}

/** Whether a null `vat_aed` row should still be read as VAT-inclusive gross. */
export function treatsStoredTotalAsGrossInclusive(inv: InvoiceVatInput): boolean {
  if (inv.vat_aed != null) return true;
  if (isGrossInclusiveServiceType(inv.service_type)) return true;
  if (isLegacyDaycarePackageInvoice(inv.notes)) return true;
  return false;
}

/**
 * Normalises stored invoice amounts for display and payment.
 * - Current: `vat_aed` set → `total` is gross; net = gross − vat_aed.
 * - Package / daycare (and legacy daycare package notes): prices are VAT-inclusive even when `vat_aed` is null.
 * - Other legacy: `vat_aed` null → `total` is ex-VAT; VAT added at {@link VAT_RATE} for grand total.
 */
export function invoiceDisplayTotals(inv: InvoiceVatInput): {
  netExVat: number;
  vat: number;
  grandTotal: number;
} {
  const stored = storedInvoiceAmount(inv);
  const vatStored = inv.vat_aed;

  if (vatStored != null) {
    const gross = roundMoney2(stored);
    const vat = roundMoney2(vatStored);
    const net = roundMoney2(Math.max(0, gross - vat));
    return { netExVat: net, vat, grandTotal: gross };
  }

  if (treatsStoredTotalAsGrossInclusive(inv)) {
    const gross = roundMoney2(Math.max(0, stored));
    const vat = vatAmountFromGrossInclusive(gross);
    const net = roundMoney2(gross - vat);
    return { netExVat: net, vat, grandTotal: gross };
  }

  const netExVat = roundMoney2(Math.max(0, stored));
  const vat = vatAmountFromNet(netExVat);
  const grandTotal = roundMoney2(netExVat + vat);
  return { netExVat, vat, grandTotal };
}

/** Amount to charge / outstanding balance (incl. VAT). */
export function invoiceAmountDue(inv: InvoiceVatInput): number {
  return invoiceDisplayTotals(inv).grandTotal;
}

export type InvoiceDiscountInput = {
  subtotal: number;
  discount_amount: number;
};

/** Computes the effective discount percentage from stored amounts. */
export function invoiceDiscountPercent(inv: InvoiceDiscountInput): number {
  const subtotalStored = inv.subtotal ?? 0;
  const discountStored = inv.discount_amount ?? 0;
  if (subtotalStored <= 0 || discountStored <= 0) return 0;
  return roundMoney2((discountStored / subtotalStored) * 100);
}
