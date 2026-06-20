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

export type InvoiceLineAmountInput = {
  quantity: number;
  unit_price: number;
  total_price?: number | null;
  line_total?: number | null;
};

/** Per-line discount/total for invoice table and print (stored line totals only). */
export function invoiceLineDisplayAmounts(line: InvoiceLineAmountInput): {
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
} {
  const lineSubtotal = roundMoney2(line.unit_price * line.quantity);
  const lineTotal = roundMoney2(line.total_price ?? line.line_total ?? lineSubtotal);
  const lineDiscount = roundMoney2(Math.max(0, lineSubtotal - lineTotal));
  return { lineSubtotal, lineDiscount, lineTotal };
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

type InvoiceAdjustmentAmount = { adjusted_amount: number | null };

/**
 * Invoice-level discount for display: `discount_amount` is authoritative when it
 * already covers billing adjustments; otherwise sum adjustments (e.g. manual
 * discount added before header sync).
 */
export function invoiceInvoiceLevelDiscount(params: {
  discount_amount: number;
  adjustments?: InvoiceAdjustmentAmount[];
}): number {
  const header = Math.max(0, params.discount_amount ?? 0);
  const adjustmentSum = roundMoney2(
    (params.adjustments ?? []).reduce(
      (sum, a) => sum + Math.abs(a.adjusted_amount ?? 0),
      0,
    ),
  );
  if (adjustmentSum <= 0) return header;
  if (header >= adjustmentSum) return header;
  return adjustmentSum;
}

/** Total discount to show on invoice UI (line-item discounts + invoice-level). */
export function invoiceTotalDisplayedDiscount(params: {
  lineDiscount?: number;
  discount_amount: number;
  adjustments?: InvoiceAdjustmentAmount[];
}): number {
  const line = Math.max(0, params.lineDiscount ?? 0);
  const invoiceLevel = invoiceInvoiceLevelDiscount(params);
  return roundMoney2(line + invoiceLevel);
}

export type InvoiceResolvedAmountsInput = InvoiceVatInput & {
  subtotal: number;
  discount_amount: number;
  lineDiscount?: number;
  adjustments?: InvoiceAdjustmentAmount[];
};

/**
 * Resolves gross/discount for display and payment when billing_adjustments exist
 * but the invoice header was not synced (legacy add-adjustment path).
 */
export function invoiceResolvedAmounts(inv: InvoiceResolvedAmountsInput): {
  totalDiscount: number;
  grossTotal: number;
  display: ReturnType<typeof invoiceDisplayTotals>;
} {
  const totalDiscount = invoiceTotalDisplayedDiscount({
    lineDiscount: inv.lineDiscount,
    discount_amount: inv.discount_amount,
    adjustments: inv.adjustments,
  });
  const calculatedGross = roundMoney2(Math.max(0, inv.subtotal - totalDiscount));
  const storedGross = roundMoney2(Math.max(0, inv.total));
  const hasUnsyncedAdjustments =
    (inv.adjustments?.length ?? 0) > 0 &&
    Math.abs(storedGross - calculatedGross) > 0.02;
  const grossTotal = hasUnsyncedAdjustments ? calculatedGross : storedGross;
  const display = invoiceDisplayTotals({
    total: grossTotal,
    vat_aed: hasUnsyncedAdjustments
      ? vatAmountFromGrossInclusive(grossTotal)
      : inv.vat_aed,
    service_type: inv.service_type,
    notes: inv.notes,
  });
  return { totalDiscount, grossTotal, display };
}

/**
 * Adjustments already rolled into `discount_amount` should not appear again on print.
 */
export function invoiceAdjustmentsForDisplay<T extends InvoiceAdjustmentAmount>(
  discount_amount: number,
  adjustments: T[],
): T[] {
  if (discount_amount <= 0) return adjustments;
  const sum = roundMoney2(
    adjustments.reduce((s, a) => s + Math.abs(a.adjusted_amount ?? 0), 0),
  );
  if (Math.abs(sum - roundMoney2(discount_amount)) < 0.02) return [];
  return adjustments;
}
