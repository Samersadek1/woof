import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  invoicePaymentMethodToTransactionType,
  type ExternalPaymentMethod,
} from "@/lib/paymentMethod";

/** Transaction types that represent an external (non-wallet) invoice payment. */
const EXTERNAL_PAYMENT_TRANSACTION_TYPES = [
  "card_payment",
  "cash_payment",
  "bank_transfer_payment",
  "payment_link_payment",
] as const;

export type ChangePaymentMethodResult = {
  success: boolean;
  error?: string;
  ownerId?: string;
  invoiceId?: string;
};

/**
 * Correct the payment method on an already-recorded external payment, instead of
 * reverting and re-recording (which leaves orphan rows in the ledger).
 *
 * Updates the `invoice_payments` row (the ledger source of truth), the matching
 * `wallet_transactions` audit row, and — when this is the latest payment — the
 * denormalised `invoices.payment_method`. Logs an `invoice_amendments` entry.
 *
 * Wallet payments are intentionally not editable here: switching to/from wallet
 * would move the owner's balance, which belongs to the revert/refund flow.
 */
export async function changeInvoicePaymentMethod(
  supabase: SupabaseClient<Database>,
  params: {
    paymentId: string;
    newMethod: ExternalPaymentMethod;
    performedBy: string;
    reason?: string;
  },
): Promise<ChangePaymentMethodResult> {
  const performedBy = params.performedBy.trim();
  if (!performedBy) return { success: false, error: "Staff name is required." };

  const { data: payment, error: payErr } = await supabase
    .from("invoice_payments")
    .select(
      "id, invoice_id, owner_id, amount, payment_method, created_at, wallet_transaction_id",
    )
    .eq("id", params.paymentId)
    .single();
  if (payErr) return { success: false, error: payErr.message };

  if (payment.payment_method === "wallet") {
    return {
      success: false,
      error: "Wallet payments can't be re-typed. Revert the payment instead.",
      ownerId: payment.owner_id,
      invoiceId: payment.invoice_id,
    };
  }

  const oldMethod = payment.payment_method;
  if (oldMethod === params.newMethod) {
    return { success: true, ownerId: payment.owner_id, invoiceId: payment.invoice_id };
  }

  // 1) Ledger source of truth.
  const { error: updPayErr } = await supabase
    .from("invoice_payments")
    .update({ payment_method: params.newMethod })
    .eq("id", payment.id);
  if (updPayErr) {
    return { success: false, error: updPayErr.message, ownerId: payment.owner_id };
  }

  // 2) Matching wallet_transactions audit row (linked, or nearest by time).
  const newTxType = invoicePaymentMethodToTransactionType(params.newMethod);
  if (payment.wallet_transaction_id) {
    await supabase
      .from("wallet_transactions")
      .update({ transaction_type: newTxType, payment_method: params.newMethod })
      .eq("id", payment.wallet_transaction_id);
  } else {
    const { data: candidates } = await supabase
      .from("wallet_transactions")
      .select("id, created_at")
      .eq("invoice_id", payment.invoice_id)
      .eq("amount", payment.amount)
      .in("transaction_type", [...EXTERNAL_PAYMENT_TRANSACTION_TYPES]);
    if (candidates && candidates.length > 0) {
      const paymentTime = new Date(payment.created_at).getTime();
      const nearest = candidates.reduce((best, c) =>
        Math.abs(new Date(c.created_at).getTime() - paymentTime) <
        Math.abs(new Date(best.created_at).getTime() - paymentTime)
          ? c
          : best,
      );
      await supabase
        .from("wallet_transactions")
        .update({ transaction_type: newTxType, payment_method: params.newMethod })
        .eq("id", nearest.id);
    }
  }

  // 3) Denormalised invoices.payment_method — only when editing the latest payment.
  const { data: latest } = await supabase
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", payment.invoice_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (latest && latest.length > 0 && latest[0].id === payment.id) {
    await supabase
      .from("invoices")
      .update({ payment_method: params.newMethod })
      .eq("id", payment.invoice_id);
  }

  // 4) Audit trail.
  await supabase.from("invoice_amendments").insert({
    invoice_id: payment.invoice_id,
    amended_by: performedBy,
    field_changed: "payment_method",
    old_value: oldMethod,
    new_value: params.newMethod,
    reason: params.reason?.trim() || "Payment method corrected",
  });

  return { success: true, ownerId: payment.owner_id, invoiceId: payment.invoice_id };
}
