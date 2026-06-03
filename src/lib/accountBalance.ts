import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { roundAed } from "@/lib/money";

type Client = SupabaseClient<Database>;

/** Collectable debt only — draft/finalised are not outstanding in the Phase 2 model. */
const OUTSTANDING_INVOICE_STATUSES = [
  "outstanding",
  "overdue",
  "partially_paid",
] as const;

export interface AccountBalance {
  walletBalance: number;
  outstandingDebt: number;
  /** wallet_balance - outstanding debt. Positive = in credit, negative = owes. */
  accountBalance: number;
}

/**
 * Account balance = wallet_balance - sum of outstanding invoice balances.
 * This is always computed live, never stored.
 */
export async function getAccountBalance(
  supabase: Client,
  ownerId: string,
): Promise<AccountBalance> {
  const { data: owner } = await supabase
    .from("owners")
    .select("wallet_balance")
    .eq("id", ownerId)
    .single();

  const walletBalance = roundAed(owner?.wallet_balance ?? 0);

  // Outstanding balance per invoice = total - amount_paid.
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total, amount_paid")
    .eq("owner_id", ownerId)
    .in("status", [...OUTSTANDING_INVOICE_STATUSES])
    .or("receipt_only.is.null,receipt_only.eq.false");

  const outstandingDebt = roundAed(
    (invoices ?? []).reduce((sum, inv) => {
      const balance = (inv.total ?? 0) - (inv.amount_paid ?? 0);
      return sum + (balance > 0 ? balance : 0);
    }, 0),
  );

  return {
    walletBalance,
    outstandingDebt,
    accountBalance: roundAed(walletBalance - outstandingDebt),
  };
}

export interface PaymentSplit {
  fromWallet: number;
  fromCard: number;
  totalToCollect: number;
}

/**
 * Given an account balance and a new invoice total, returns how much comes from
 * wallet (account credit) and how much must be collected by card/cash.
 */
export function calculatePaymentSplit(
  accountBalance: number,
  invoiceTotal: number,
): PaymentSplit {
  const walletAvailable = Math.max(accountBalance, 0);
  const fromWallet = roundAed(Math.min(walletAvailable, invoiceTotal));
  const fromCard = roundAed(invoiceTotal - fromWallet);

  return {
    fromWallet,
    fromCard,
    totalToCollect: roundAed(invoiceTotal),
  };
}
