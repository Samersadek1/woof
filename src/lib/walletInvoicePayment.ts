import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { deriveInvoiceStatusAfterRecalc } from "@/lib/boardingInvoiceLineUtils";
import { roundAed } from "@/lib/money";
import { invoiceAmountDue } from "@/lib/vatConfig";

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
        return {
          success: true,
          amountCharged: rpc.amount_charged ?? balanceDue,
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
  const newWalletBalance = roundAed(walletBalance - chargeAmount);
  const newAmountPaid = roundAed(alreadyPaid + chargeAmount);
  const partial = newAmountPaid < grandTotal;
  const newStatus = deriveInvoiceStatusAfterRecalc(
    invoice.status,
    newAmountPaid,
    grandTotal,
  );

  const { error: ownerUpdateErr } = await supabase
    .from("owners")
    .update({ wallet_balance: newWalletBalance })
    .eq("id", ownerId);
  if (ownerUpdateErr) {
    return { success: false, error: ownerUpdateErr.message, ownerId };
  }

  const invoiceUpdate: Database["public"]["Tables"]["invoices"]["Update"] = {
    status: newStatus as Database["public"]["Enums"]["invoice_status"],
    payment_method: "wallet",
    amount_paid: newAmountPaid,
  };
  if (!partial) {
    invoiceUpdate.paid_at = new Date().toISOString();
  }

  const { error: invUpdateErr } = await supabase
    .from("invoices")
    .update(invoiceUpdate)
    .eq("id", invoiceId);
  if (invUpdateErr) {
    return { success: false, error: invUpdateErr.message, ownerId };
  }

  const { error: txErr } = await supabase.from("wallet_transactions").insert({
    owner_id: ownerId,
    transaction_type: "deduction",
    amount: -chargeAmount,
    balance_after: newWalletBalance,
    invoice_id: invoiceId,
    performed_by: performedBy,
    notes: partial
      ? "Partial invoice payment via wallet"
      : "Invoice payment via wallet",
  });
  if (txErr) {
    return { success: false, error: txErr.message, ownerId };
  }

  return {
    success: true,
    amountCharged: chargeAmount,
    newWalletBalance,
    ownerId,
    partial: partial || undefined,
    shortfall: partial ? roundAed(grandTotal - newAmountPaid) : undefined,
  };
}
