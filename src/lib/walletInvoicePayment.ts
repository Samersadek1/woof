import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveWalletChargeAmount } from "@/lib/accountBalance";
import { fetchLedgerClosingK } from "@/lib/ledgerClosingBalance";
import { spendableWalletFromK } from "@/lib/ownerBalances";
import { roundAed } from "@/lib/money";
import { invoiceAmountDue } from "@/lib/vatConfig";
import { recordPayment } from "@/services/invoiceService";

export type WalletPaymentResult = {
  success: boolean;
  amountCharged?: number;
  newWalletBalance?: number;
  ownerId?: string;
  error?: string;
  shortfall?: number;
  partial?: boolean;
};

/**
 * Pay an invoice from the owner's wallet via recordPayment — writes
 * invoice_payments + wallet_transactions and lets the DB trigger update status.
 */
export async function payInvoiceFromWallet(
  supabase: SupabaseClient<Database>,
  params: { invoiceId: string; performedBy: string; amountAed?: number },
): Promise<WalletPaymentResult> {
  const { invoiceId, performedBy, amountAed } = params;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, total, vat_aed, service_type, notes, amount_paid, status",
    )
    .eq("id", invoiceId)
    .single();
  if (invErr) return { success: false, error: invErr.message };

  const ownerId = invoice.owner_id;
  const grandTotal = invoiceAmountDue({
    total: invoice.total,
    vat_aed: invoice.vat_aed,
    service_type: invoice.service_type,
    notes: invoice.notes,
  });
  const alreadyPaid = roundAed(invoice.amount_paid ?? 0);
  const balanceDue = roundAed(Math.max(0, grandTotal - alreadyPaid));

  if (balanceDue <= 0) {
    return { success: true, amountCharged: 0, ownerId };
  }

  const { data: owner, error: ownerErr } = await supabase
    .from("owners")
    .select("wallet_balance")
    .eq("id", ownerId)
    .single();
  if (ownerErr) return { success: false, error: ownerErr.message, ownerId };

  const walletBalance = roundAed(owner.wallet_balance ?? 0);
  let soaSpendable = walletBalance;
  try {
    const k = await fetchLedgerClosingK(supabase, ownerId);
    soaSpendable = roundAed(Math.min(walletBalance, spendableWalletFromK(k)));
  } catch {
    // Ledger RPC not deployed yet — fall back to cached wallet balance.
  }

  const chargeAmount = resolveWalletChargeAmount(amountAed, soaSpendable, balanceDue);

  if (chargeAmount <= 0) {
    return {
      success: false,
      error: "Insufficient wallet balance",
      shortfall: balanceDue,
      ownerId,
    };
  }

  const newAmountPaid = roundAed(alreadyPaid + chargeAmount);
  const partial = newAmountPaid < grandTotal;

  // recordPayment owns the wallet deduction (wallet_transactions + balance
  // decrement), the invoice_payments row, and — via the
  // trg_update_invoice_status_on_payment trigger — invoices.amount_paid / status
  // / paid_at. This is the primary write here (not a best-effort dual-write), so
  // a failure is fatal for this payment.
  const res = await recordPayment({
    invoiceId,
    amount: chargeAmount,
    method: "wallet",
    recordedBy: performedBy,
    notes: partial
      ? "Partial invoice payment via wallet"
      : "Invoice payment via wallet",
    client: supabase,
  });
  if (!res.success) {
    return { success: false, error: res.error, ownerId };
  }

  const newWalletBalance = res.closingBalance ?? roundAed(walletBalance - chargeAmount);

  return {
    success: true,
    amountCharged: chargeAmount,
    newWalletBalance,
    ownerId,
    partial: partial || undefined,
    shortfall: partial ? roundAed(grandTotal - newAmountPaid) : undefined,
  };
}
