import { roundAed } from "@/lib/money";
import { isLegacyDaycarePackageInvoice, type InvoiceVatInput, invoiceAmountDue } from "@/lib/vatConfig";

const BLOCKED_COLLECT_STATUSES = new Set(["voided", "cancelled", "draft"]);

/** True when staff can record wallet / external payment against this invoice. */
export function canCollectInvoicePayment(
  status: string,
  balanceDue: number,
): boolean {
  if (BLOCKED_COLLECT_STATUSES.has(status)) return false;
  return balanceDue > 0.01;
}

/** Balance still owed after recorded payments (incl. VAT). */
export function invoiceBalanceDue(
  inv: InvoiceVatInput & { amount_paid?: number | null },
): number {
  const grandTotal = invoiceAmountDue(inv);
  const paid = roundAed(Math.max(0, inv.amount_paid ?? 0));
  return roundAed(Math.max(0, grandTotal - paid));
}

/**
 * Legacy import often set status `paid` when the old system showed settled,
 * without writing amount_paid or invoice_payments rows.
 */
export function isLegacyImportPaidStatusMismatch(
  notes: string | null | undefined,
  status: string,
  balanceDue: number,
): boolean {
  return (
    isLegacyDaycarePackageInvoice(notes) &&
    status === "paid" &&
    balanceDue > 0.01
  );
}
