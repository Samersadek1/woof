import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { roundAed } from "@/lib/money";
import { invoiceAmountDue } from "@/lib/vatConfig";

type Client = SupabaseClient<Database>;

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

  // Outstanding balance per invoice = amount due (incl. VAT) − amount_paid.
  // Include legacy rows marked `paid` without payment rows — status alone is not reliable.
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total, amount_paid, vat_aed, service_type, notes, status")
    .eq("owner_id", ownerId)
    .not("status", "in", '("voided","cancelled","draft")')
    .or("receipt_only.is.null,receipt_only.eq.false");

  const outstandingDebt = roundAed(
    (invoices ?? []).reduce((sum, inv) => {
      const due = invoiceAmountDue({
        total: inv.total ?? 0,
        vat_aed: inv.vat_aed,
        service_type: inv.service_type,
        notes: inv.notes,
      });
      const balance = due - (inv.amount_paid ?? 0);
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

/** Seed editable wallet + card fields for a single-invoice payment dialog. */
export function seedInvoicePaymentSplit(walletBalance: number, invoiceTotal: number) {
  const walletSeed = roundAed(Math.min(Math.max(walletBalance, 0), invoiceTotal));
  const cardSeed = roundAed(Math.max(0, invoiceTotal - walletSeed));
  return { walletSeed, cardSeed };
}

/** Wallet charge capped by available wallet and outstanding balance. */
export function resolveWalletChargeAmount(
  requestedAed: number | undefined,
  walletBalance: number,
  balanceDue: number,
): number {
  const requested = requestedAed ?? balanceDue;
  return roundAed(Math.min(Math.max(0, requested), walletBalance, balanceDue));
}
