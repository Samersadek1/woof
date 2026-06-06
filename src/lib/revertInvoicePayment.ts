import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInDays, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { deriveInvoiceStatusAfterRecalc } from "@/lib/boardingInvoiceLineUtils";
import { roundAed } from "@/lib/money";
import { invoiceAmountDue } from "@/lib/vatConfig";

export const REVERT_PAYMENT_WINDOW_DAYS = 14;

const PAYMENT_TRANSACTION_TYPES = new Set([
  "deduction",
  "card_payment",
  "cash_payment",
  "bank_transfer_payment",
  "payment_link_payment",
]);

export type RevertInvoicePaymentResult = {
  success: boolean;
  error?: string;
  walletRefunded?: number;
  ownerId?: string;
};

type PaymentRow = Pick<
  Database["public"]["Tables"]["wallet_transactions"]["Row"],
  "id" | "transaction_type" | "amount"
>;

export function canRevertInvoicePayment(
  invoice: { status: string; paid_at: string | null },
  payments: Array<{ created_at: string; transaction_type?: string }>,
  now: Date = new Date(),
): boolean {
  if (invoice.status !== "paid" && invoice.status !== "partially_paid") return false;

  const paymentRows = payments.filter(
    (p) => !p.transaction_type || PAYMENT_TRANSACTION_TYPES.has(p.transaction_type),
  );

  const paidAt =
    invoice.paid_at ??
    [...paymentRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]?.created_at;

  if (!paidAt) return false;

  return differenceInDays(now, parseISO(paidAt)) <= REVERT_PAYMENT_WINDOW_DAYS;
}

export function walletRefundFromPayments(payments: PaymentRow[]): number {
  return roundAed(
    payments
      .filter((p) => p.transaction_type === "deduction" && p.amount < 0)
      .reduce((sum, p) => sum + Math.abs(p.amount), 0),
  );
}

/**
 * Undo a recent paid invoice: reset invoice first, then credit wallet if needed.
 *
 * The `invoice_payments` rows are the ledger's source of truth, so leaving them
 * behind makes a reverted payment keep showing on the ledger/detail. We archive
 * them to `invoice_amendments` (audit trail) and delete them so the ledger,
 * detail and print all agree. The underlying `wallet_transactions` rows are kept
 * (full financial history + wallet balance), and a `refund` row is added for
 * wallet pays.
 */
export async function revertInvoicePayment(
  supabase: SupabaseClient<Database>,
  params: { invoiceId: string; performedBy: string; reason?: string },
): Promise<RevertInvoicePaymentResult> {
  const { invoiceId, performedBy, reason } = params;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, total, vat_aed, service_type, notes, amount_paid, status, paid_at",
    )
    .eq("id", invoiceId)
    .single();
  if (invErr) return { success: false, error: invErr.message };

  const { data: paymentsRaw, error: payErr } = await supabase
    .from("wallet_transactions")
    .select("id, transaction_type, amount, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  if (payErr) return { success: false, error: payErr.message };

  const payments = (paymentsRaw ?? []).filter((p) =>
    PAYMENT_TRANSACTION_TYPES.has(p.transaction_type),
  );

  // Ledger source-of-truth rows to archive + remove so reverted payments stop
  // showing on the ledger / detail.
  const { data: invoicePaymentRows, error: ipErr } = await supabase
    .from("invoice_payments")
    .select("id, amount, payment_method, recorded_by, created_at")
    .eq("invoice_id", invoiceId);
  if (ipErr) return { success: false, error: ipErr.message };

  if (!canRevertInvoicePayment(invoice, paymentsRaw ?? [])) {
    return {
      success: false,
      error: `Only invoices marked paid within the last ${REVERT_PAYMENT_WINDOW_DAYS} days can be reverted.`,
    };
  }

  const ownerId = invoice.owner_id;
  const walletRefund = walletRefundFromPayments(payments);

  const grandTotal = invoiceAmountDue({
    total: invoice.total,
    vat_aed: invoice.vat_aed,
    service_type: invoice.service_type,
    notes: invoice.notes,
  });
  const newStatus = deriveInvoiceStatusAfterRecalc(invoice.status, 0, grandTotal);

  const { error: invUpdateErr } = await supabase
    .from("invoices")
    .update({
      status: newStatus as Database["public"]["Enums"]["invoice_status"],
      payment_method: null,
      paid_at: null,
      amount_paid: 0,
    })
    .eq("id", invoiceId);
  if (invUpdateErr) return { success: false, error: invUpdateErr.message, ownerId };

  // Archive the ledger rows to invoice_amendments, then delete them so the
  // reverted payment no longer appears on the ledger / detail. wallet_transactions
  // are deliberately retained for financial audit.
  if (invoicePaymentRows && invoicePaymentRows.length > 0) {
    const { error: auditErr } = await supabase.from("invoice_amendments").insert({
      invoice_id: invoiceId,
      amended_by: performedBy.trim(),
      field_changed: "payments_reverted",
      old_value: JSON.stringify(
        invoicePaymentRows.map((r) => ({
          amount: r.amount,
          method: r.payment_method,
          recorded_by: r.recorded_by,
          created_at: r.created_at,
        })),
      ),
      new_value: null,
      reason: reason?.trim() || "Payment reverted",
    });
    if (auditErr) return { success: false, error: auditErr.message, ownerId };

    const { error: delErr } = await supabase
      .from("invoice_payments")
      .delete()
      .eq("invoice_id", invoiceId);
    if (delErr) return { success: false, error: delErr.message, ownerId };
  }

  if (walletRefund > 0) {
    const { data: owner, error: ownerErr } = await supabase
      .from("owners")
      .select("wallet_balance")
      .eq("id", ownerId)
      .single();
    if (ownerErr) {
      return {
        success: false,
        error: `${ownerErr.message}. Invoice was reset to unpaid — credit the wallet manually if needed.`,
        ownerId,
      };
    }

    const newBalance = roundAed((owner.wallet_balance ?? 0) + walletRefund);

    const { error: ownerUpdateErr } = await supabase
      .from("owners")
      .update({ wallet_balance: newBalance })
      .eq("id", ownerId);
    if (ownerUpdateErr) {
      return {
        success: false,
        error: `${ownerUpdateErr.message}. Invoice was reset to unpaid — credit the wallet manually if needed.`,
        ownerId,
      };
    }

    const note = reason?.trim()
      ? `Payment reverted — ${reason.trim()}`
      : "Payment reverted";

    const { error: refundErr } = await supabase.from("wallet_transactions").insert({
      owner_id: ownerId,
      invoice_id: invoiceId,
      transaction_type: "refund",
      amount: walletRefund,
      balance_after: newBalance,
      performed_by: performedBy.trim(),
      notes: note,
    });
    if (refundErr) {
      return {
        success: false,
        error: `${refundErr.message}. Invoice was reset to unpaid — credit the wallet manually if needed.`,
        ownerId,
      };
    }
  }

  return { success: true, walletRefunded: walletRefund, ownerId };
}
