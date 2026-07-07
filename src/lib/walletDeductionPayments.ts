import { roundAed } from "@/lib/money";

export type InvoicePaymentLike = {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string;
  created_at: string;
  wallet_transaction_id?: string | null;
  notes?: string | null;
};

export type WalletDeductionLike = {
  id: string;
  invoice_id: string | null;
  amount: number;
  created_at: string;
  notes?: string | null;
  payment_method?: string | null;
};

/** Wallet deductions on invoices that have no matching invoice_payments row. */
export function orphanWalletDeductions(
  payments: InvoicePaymentLike[],
  deductions: WalletDeductionLike[],
): WalletDeductionLike[] {
  const linkedWtIds = new Set(
    payments.map((p) => p.wallet_transaction_id).filter(Boolean) as string[],
  );

  return deductions.filter((wt) => {
    if (!wt.invoice_id || wt.amount >= 0) return false;
    if (linkedWtIds.has(wt.id)) return false;

    const wtAmount = roundAed(Math.abs(wt.amount));
    const matchedByAmount = payments.some(
      (p) =>
        p.invoice_id === wt.invoice_id &&
        p.payment_method === "wallet" &&
        roundAed(p.amount) === wtAmount,
    );
    return !matchedByAmount;
  });
}

export function syntheticWalletPaymentsFromDeductions(
  deductions: WalletDeductionLike[],
): InvoicePaymentLike[] {
  return deductions.map((wt) => ({
    id: `wt:${wt.id}`,
    invoice_id: wt.invoice_id!,
    amount: roundAed(Math.abs(wt.amount)),
    payment_method: "wallet",
    created_at: wt.created_at,
    wallet_transaction_id: wt.id,
    notes: wt.notes ?? "Invoice payment via wallet",
  }));
}
