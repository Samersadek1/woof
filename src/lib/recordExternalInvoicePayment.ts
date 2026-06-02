import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { deriveInvoiceStatusAfterRecalc } from "@/lib/boardingInvoiceLineUtils";
import { roundAed } from "@/lib/money";
import { invoiceAmountDue } from "@/lib/vatConfig";
import {
  invoicePaymentMethodToTransactionType,
  type ExternalPaymentMethod,
} from "@/lib/paymentMethod";

export type RecordExternalPaymentResult = {
  success: boolean;
  error?: string;
  ownerId?: string;
  amountRecorded?: number;
  newAmountPaid?: number;
  partial?: boolean;
};

export async function recordExternalInvoicePayment(
  supabase: SupabaseClient<Database>,
  params: {
    invoiceId: string;
    method: ExternalPaymentMethod;
    performedBy: string;
    amountAed?: number;
    note?: string;
  },
): Promise<RecordExternalPaymentResult> {
  const { invoiceId, method, performedBy, note } = params;

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, total, vat_aed, service_type, notes, amount_paid, status",
    )
    .eq("id", invoiceId)
    .single();
  if (invoiceErr) return { success: false, error: invoiceErr.message };

  const grandTotal = invoiceAmountDue({
    total: invoice.total,
    vat_aed: invoice.vat_aed,
    service_type: invoice.service_type,
    notes: invoice.notes,
  });

  const alreadyPaid = roundAed(Math.max(0, invoice.amount_paid ?? 0));
  const outstanding = roundAed(Math.max(0, grandTotal - alreadyPaid));
  if (outstanding <= 0) {
    return { success: false, error: "Invoice has no outstanding balance." };
  }

  const requested = params.amountAed ?? outstanding;
  const amount = roundAed(Math.min(Math.max(0, requested), outstanding));
  if (amount <= 0) {
    return { success: false, error: "Payment amount must be greater than zero." };
  }

  const { data: owner, error: ownerErr } = await supabase
    .from("owners")
    .select("wallet_balance")
    .eq("id", invoice.owner_id)
    .single();
  if (ownerErr) return { success: false, error: ownerErr.message };

  const txType = invoicePaymentMethodToTransactionType(method);
  const newAmountPaid = roundAed(alreadyPaid + amount);
  const partial = newAmountPaid < grandTotal;
  const newStatus = deriveInvoiceStatusAfterRecalc(invoice.status, newAmountPaid, grandTotal);

  const { error: txErr } = await supabase.from("wallet_transactions").insert({
    owner_id: invoice.owner_id,
    invoice_id: invoice.id,
    transaction_type: txType,
    amount,
    balance_after: owner.wallet_balance ?? 0,
    payment_method: method,
    performed_by: performedBy.trim(),
    notes: note?.trim() || (partial ? `Partial invoice payment by ${method}` : `Invoice paid by ${method}`),
  });
  if (txErr) return { success: false, error: txErr.message };

  const { error: payErr } = await supabase
    .from("invoices")
    .update({
      status: newStatus as Database["public"]["Enums"]["invoice_status"],
      // TODO: deprecate after invoice_payments migration
      payment_method: method,
      // TODO: deprecate after invoice_payments migration
      amount_paid: newAmountPaid,
      paid_at: partial ? null : new Date().toISOString(),
    })
    .eq("id", invoice.id);

  if (payErr) {
    return {
      success: false,
      error: `Payment recorded but invoice update failed: ${payErr.message}`,
    };
  }

  // Dual-write to invoice_payments (new model). Best-effort: the legacy
  // amount_paid update above already succeeded. closing_balance is the remaining
  // invoice balance (total - amount_paid); wallet balance is unaffected by
  // card/cash payments and is not represented here.
  try {
    const { data: inv } = await supabase
      .from("invoices")
      .select("opening_balance, total, amount_paid")
      .eq("id", invoice.id)
      .single();
    const closingBalance = roundAed((inv?.total ?? 0) - (inv?.amount_paid ?? 0));
    await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      owner_id: invoice.owner_id,
      amount: roundAed(amount),
      payment_method: method,
      wallet_transaction_id: null,
      opening_balance: roundAed(inv?.opening_balance ?? 0),
      closing_balance: closingBalance,
      recorded_by: performedBy.trim() || "system",
    });
  } catch {
    // Best-effort dual-write.
  }

  return {
    success: true,
    ownerId: invoice.owner_id,
    amountRecorded: amount,
    newAmountPaid,
    partial,
  };
}
