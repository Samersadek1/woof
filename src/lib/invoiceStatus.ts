import { roundAed } from "@/lib/money";

/** Terminal statuses — invoice is closed and not collectable. */
export const INACTIVE_INVOICE_STATUSES = ["voided", "cancelled", "consolidated"] as const;

export type InactiveInvoiceStatus = (typeof INACTIVE_INVOICE_STATUSES)[number];

export function isInactiveInvoiceStatus(status: string): boolean {
  return (INACTIVE_INVOICE_STATUSES as readonly string[]).includes(status);
}

/**
 * Invoices that participate in the SOA / ledger running balance.
 * Drafts are excluded — not finalized, so they must not debit customer debt.
 * Mirrors public.is_soa_invoice_status.
 */
export function isSoaInvoiceStatus(status: string): boolean {
  return (
    !isInactiveInvoiceStatus(status) && status !== "draft"
  );
}

export function canEditInvoice(status: string): boolean {
  return !isInactiveInvoiceStatus(status) && status !== "paid";
}

/** Returns 0 for consolidated/voided/cancelled; otherwise max(0, total - amountPaid - openingBalance).
 * `openingBalance` is the invoice deposit / opening credit (invoices.opening_balance). */
export function invoiceBalanceDue(
  status: string,
  total: number,
  amountPaid = 0,
  openingBalance = 0,
): number {
  if (isInactiveInvoiceStatus(status)) return 0;
  return roundAed(
    Math.max(0, total - amountPaid - Math.max(0, openingBalance)),
  );
}

/** Statuses excluded when finding the current (non-superseded) invoice for a booking/owner. */
export const SUPERSEDED_INVOICE_STATUSES = ["voided", "consolidated"] as const;

type SupersededFilterQuery<T> = {
  not: (column: string, operator: string, value: string) => T;
};

export const SUPERSEDED_INVOICE_STATUS_FILTER = "(voided,consolidated)" as const;

/** Exclude superseded invoices from an active-invoice lookup. */
export function withoutSupersededInvoices<T extends SupersededFilterQuery<T>>(query: T): T {
  return query.not("status", "in", SUPERSEDED_INVOICE_STATUS_FILTER);
}
