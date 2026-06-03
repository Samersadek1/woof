import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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

type RpcWalletResult = {
  success?: boolean;
  error?: string;
  amount_charged?: number;
  new_balance?: number;
  shortfall?: number;
};

/**
 * Pay an invoice from the owner's wallet. Tries `process_wallet_payment` RPC for
 * simple full payments; falls back to client-side logic for partial payments or
 * when the RPC is unavailable.
 */
export async function payInvoiceFromWallet(
  supabase: SupabaseClient<Database>,
  params: { invoiceId: string; performedBy: string },
): Promise<WalletPaymentResult> {
  const { invoiceId, performedBy } = params;

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

  if (walletBalance <= 0) {
    return {
      success: false,
      error: "Insufficient wallet balance",
      shortfall: balanceDue,
      ownerId,
    };
  }

  // Full payment on a clean invoice — prefer RPC when deployed.
  if (walletBalance >= balanceDue && alreadyPaid <= 0) {
    const { data, error: rpcErr } = await supabase.rpc("process_wallet_payment", {
      p_invoice_id: invoiceId,
      p_performed_by: performedBy,
    });

    if (!rpcErr && data) {
      const rpc = data as RpcWalletResult;
      if (rpc.success) {
        const amount = rpc.amount_charged ?? balanceDue;
        // RPC already debited the wallet + wrote wallet_transactions; only the
        // invoice_payments row is still needed. Best-effort dual-write.
        try {
          const dual = await recordPayment({
            invoiceId,
            amount,
            method: "wallet",
            recordedBy: performedBy,
            skipWalletDeduction: true,
            client: supabase,
          });
          if (!dual.success) {
            console.error("[invoice_payments dual-write failed]", {
              invoiceId,
              amount,
              err: dual.error,
            });
            // Non-fatal — legacy path already recorded payment
          }
        } catch (err) {
          console.error("[invoice_payments dual-write failed]", {
            invoiceId,
            amount,
            err,
          });
          // Non-fatal — legacy path already recorded payment
        }
        return {
          success: true,
          amountCharged: amount,
          newWalletBalance: rpc.new_balance,
          ownerId,
        };
      }
      if (rpc.success === false) {
        return {
          success: false,
          error: rpc.error ?? "Wallet payment failed",
          shortfall: rpc.shortfall ?? balanceDue,
          ownerId,
        };
      }
    }
  }

  const chargeAmount = roundAed(Math.min(walletBalance, balanceDue));
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
