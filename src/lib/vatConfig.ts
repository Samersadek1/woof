/**
 * UAE VAT rate for service invoices. Update here only — UI and invoice math import this.
 */
export const VAT_RATE = 0.05 as const;

export const VAT_PERCENT_LABEL = `${VAT_RATE * 100}%`;

/** User-facing label for invoice lines, e.g. "VAT (5%)". */
export function vatLineLabel(): string {
  return `VAT (${VAT_PERCENT_LABEL})`;
}

export function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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

export type InvoiceVatInput = {
  total: number;
  total_aed: number | null;
  /** When set (incl. 0), `total` / `total_aed` is the gross amount incl. VAT. When null, stored total is ex-VAT (legacy). */
  vat_aed?: number | null;
};

/**
 * Normalises stored invoice amounts for display and payment.
 * - Legacy: `vat_aed` is null → `total_aed` is ex-VAT; VAT is computed at {@link VAT_RATE}.
 * - Current: `vat_aed` is set → `total_aed` is gross; net ex-VAT = gross − vat_aed.
 */
export function invoiceDisplayTotals(inv: InvoiceVatInput): {
  netExVat: number;
  vat: number;
  grandTotal: number;
} {
  const stored = inv.total_aed ?? inv.total ?? 0;
  const vatStored = inv.vat_aed;

  if (vatStored != null) {
    const gross = roundMoney2(stored);
    const vat = roundMoney2(vatStored);
    const net = roundMoney2(Math.max(0, gross - vat));
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
