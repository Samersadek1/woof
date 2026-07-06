import { roundAed } from "@/lib/money";
import type { StatementRow } from "@/hooks/useStatement";

/** Collectable open invoice statuses (woof Phase 2 model). */
export const OPEN_INVOICE_STATUSES = [
  "outstanding",
  "overdue",
  "partially_paid",
] as const;

export type LedgerRowLike = {
  amount: number;
  balance_after: number;
  is_opening_balance?: boolean;
};

export function isOpenInvoiceStatus(status: string): boolean {
  return (OPEN_INVOICE_STATUSES as readonly string[]).includes(status);
}

/** Last ledger row balance_after — positive = credit ahead, negative = owes. */
export function closingKFromLedger(rows: LedgerRowLike[]): number {
  if (rows.length === 0) return 0;
  const last = rows[rows.length - 1];
  return roundAed(last.balance_after);
}

/** Spendable wallet credit from SOA K. */
export function spendableWalletFromK(k: number): number {
  return roundAed(Math.max(0, k));
}

/** Debt when K is negative. */
export function outstandingDebtFromK(k: number): number {
  return roundAed(Math.max(0, -k));
}

export function invoiceRemainingTotal(invoices: StatementRow[]): number {
  return roundAed(
    invoices
      .filter((inv) => isOpenInvoiceStatus(inv.status))
      .reduce((sum, inv) => sum + Math.max(0, inv.total), 0),
  );
}

export function canPayAllFromWallet(k: number, invoiceRemaining: number): boolean {
  if (invoiceRemaining <= 0) return false;
  return spendableWalletFromK(k) >= invoiceRemaining;
}

export type OwnerBalanceSnapshot = {
  /** SOA closing K. */
  netPosition: number;
  wallet: number;
  /** max(0, -K) — SOA debt when K is negative. */
  outstandingDebt: number;
  /** Alias for outstandingDebt (admin-essentials naming). */
  outstanding: number;
  /** Alias for wallet / max(0, K). */
  combinedWallet: number;
  invoiceRemainingTotal: number;
  canPayAll: boolean;
};

export function deriveOwnerBalances(
  k: number,
  openInvoices: StatementRow[],
): OwnerBalanceSnapshot {
  const invoiceRemaining = invoiceRemainingTotal(openInvoices);
  const wallet = spendableWalletFromK(k);
  const outstandingDebt = outstandingDebtFromK(k);
  return {
    netPosition: roundAed(k),
    wallet,
    outstandingDebt,
    outstanding: outstandingDebt,
    combinedWallet: wallet,
    invoiceRemainingTotal: invoiceRemaining,
    canPayAll: canPayAllFromWallet(k, invoiceRemaining),
  };
}

export type PeriodTotals = {
  opening: number;
  credits: number;
  debits: number;
  netMovement: number;
  closing: number;
};

/** Period stats excluding opening row amounts from credit/debit sums. */
export function computePeriodTotals(rows: LedgerRowLike[]): PeriodTotals {
  const openingRow = rows.find((r) => r.is_opening_balance);
  const opening = roundAed(openingRow?.balance_after ?? 0);
  const movementRows = rows.filter((r) => !r.is_opening_balance);

  let credits = 0;
  let debits = 0;
  for (const row of movementRows) {
    if (row.amount > 0) credits += row.amount;
    else if (row.amount < 0) debits += Math.abs(row.amount);
  }

  credits = roundAed(credits);
  debits = roundAed(debits);
  const closing =
    movementRows.length > 0
      ? roundAed(movementRows[movementRows.length - 1].balance_after)
      : opening;

  return {
    opening,
    credits,
    debits,
    netMovement: roundAed(credits - debits),
    closing,
  };
}
