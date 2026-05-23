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
  const totalBase = inv.total ?? 0;
  const totalAedBase = inv.total_aed;
  // Hygiene fallback for historical rows where *_aed columns were persisted as 0
  // while total held the real amount.
  const stored =
    totalAedBase != null && Number(totalAedBase) === 0 && Number(totalBase) > 0
      ? totalBase
      : totalAedBase ?? totalBase;
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

export type InvoiceDiscountInput = {
  subtotal: number;
  subtotal_aed: number | null;
  discount_amount: number;
  discount_aed: number | null;
};

/** Computes the effective discount percentage from stored amounts. */
export function invoiceDiscountPercent(inv: InvoiceDiscountInput): number {
  const subtotalStored =
    inv.subtotal_aed != null && Number(inv.subtotal_aed) === 0 && Number(inv.subtotal) > 0
      ? inv.subtotal
      : inv.subtotal_aed ?? inv.subtotal ?? 0;
  const discountStored =
    inv.discount_aed != null && Number(inv.discount_aed) === 0 && Number(inv.discount_amount) > 0
      ? inv.discount_amount
      : inv.discount_aed ?? inv.discount_amount ?? 0;
  if (subtotalStored <= 0 || discountStored <= 0) return 0;
  return roundMoney2((discountStored / subtotalStored) * 100);
}
