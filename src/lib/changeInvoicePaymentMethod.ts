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
 * Correct the payment method and/or recorded date on an already-recorded external
 * payment, instead of reverting and re-recording (which leaves orphan rows in the
 * ledger).
 *
 * Updates the `invoice_payments` row (the ledger source of truth), the matching
 * `wallet_transactions` audit row, and — when this is the latest payment — the
 * denormalised `invoices.payment_method` / `invoices.paid_at`. Logs
 * `invoice_amendments` entries for each field changed.
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
    /** ISO datetime string — update `created_at` on the payment when provided. */
    newDate?: string;
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

  const methodChanged = payment.payment_method !== params.newMethod;
  const dateChanged =
    params.newDate != null &&
    new Date(params.newDate).toISOString() !== new Date(payment.created_at).toISOString();

  if (!methodChanged && !dateChanged) {
    return { success: true, ownerId: payment.owner_id, invoiceId: payment.invoice_id };
  }

  // 1) Ledger source of truth.
  const paymentUpdate: Record<string, string> = {};
  if (methodChanged) paymentUpdate.payment_method = params.newMethod;
  if (dateChanged) paymentUpdate.created_at = new Date(params.newDate!).toISOString();

  const { error: updPayErr } = await supabase
    .from("invoice_payments")
    .update(paymentUpdate)
    .eq("id", payment.id);
  if (updPayErr) {
    return { success: false, error: updPayErr.message, ownerId: payment.owner_id };
  }

  // 2) Matching wallet_transactions audit row (linked, or nearest by time).
  const txUpdate: Record<string, string> = {};
  if (methodChanged) {
    const newTxType = invoicePaymentMethodToTransactionType(params.newMethod);
    txUpdate.transaction_type = newTxType;
    txUpdate.payment_method = params.newMethod;
  }
  if (dateChanged) txUpdate.created_at = new Date(params.newDate!).toISOString();

  if (Object.keys(txUpdate).length > 0) {
    if (payment.wallet_transaction_id) {
      await supabase
        .from("wallet_transactions")
        .update(txUpdate)
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
          .update(txUpdate)
          .eq("id", nearest.id);
      }
    }
  }

  // 3) Denormalised invoices fields — only when editing the latest payment.
  const { data: latest } = await supabase
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", payment.invoice_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (latest && latest.length > 0 && latest[0].id === payment.id) {
    const invoiceUpdate: Record<string, string> = {};
    if (methodChanged) invoiceUpdate.payment_method = params.newMethod;
    if (dateChanged) invoiceUpdate.paid_at = new Date(params.newDate!).toISOString();
    if (Object.keys(invoiceUpdate).length > 0) {
      await supabase.from("invoices").update(invoiceUpdate).eq("id", payment.invoice_id);
    }
  }

  // 4) Audit trail — one entry per changed field.
  const reason = params.reason?.trim() || undefined;
  if (methodChanged) {
    await supabase.from("invoice_amendments").insert({
      invoice_id: payment.invoice_id,
      amended_by: performedBy,
      field_changed: "payment_method",
      old_value: payment.payment_method,
      new_value: params.newMethod,
      reason: reason ?? "Payment method corrected",
    });
  }
  if (dateChanged) {
    await supabase.from("invoice_amendments").insert({
      invoice_id: payment.invoice_id,
      amended_by: performedBy,
      field_changed: "payment_date",
      old_value: payment.created_at,
      new_value: new Date(params.newDate!).toISOString(),
      reason: reason ?? "Payment date corrected",
    });
  }

  return { success: true, ownerId: payment.owner_id, invoiceId: payment.invoice_id };
}
