import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { deriveInvoiceStatusAfterRecalc } from "@/lib/boardingInvoiceLineUtils";
import { roundAed } from "@/lib/money";
import { invoiceDisplayTotals, vatAmountFromGrossInclusive } from "@/lib/vatConfig";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type LineRow = Database["public"]["Tables"]["invoice_line_items"]["Row"];

const PAYMENT_TX_TYPES = new Set([
  "cash_payment",
  "card_payment",
  "deduction",
]);

export function canEditInvoiceLineItems(status: string): boolean {
  return !["voided", "cancelled", "paid"].includes(status);
}

function totalsFromLines(
  lines: Pick<LineRow, "quantity" | "unit_price">[],
  discountAed: number,
): { subtotal: number; grossTotal: number; vatAed: number } {
  const subtotal = lines.reduce(
    (s, li) => s + li.unit_price * Math.max(1, li.quantity),
    0,
  );
  const grossTotal = Math.max(0, roundAed(subtotal - discountAed));
  const vatAed = vatAmountFromGrossInclusive(grossTotal);
  return { subtotal: roundAed(subtotal), grossTotal, vatAed };
}

async function effectiveAmountPaid(invoice: InvoiceRow): Promise<number> {
  const stored = roundAed(invoice.amount_paid ?? 0);
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("amount, transaction_type")
    .eq("invoice_id", invoice.id);
  if (error) throw error;

  const fromTx = (data ?? []).reduce((sum, row) => {
    if (!PAYMENT_TX_TYPES.has(row.transaction_type)) return sum;
    return sum + Math.abs(Number(row.amount) || 0);
  }, 0);

  return roundAed(Math.max(stored, fromTx));
}

/** Recompute invoice header totals from line items; preserves discount_aed. */
export async function recalculateInvoiceTotals(invoiceId: string): Promise<void> {
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (invErr) throw invErr;

  const { data: lines, error: linesErr } = await supabase
    .from("invoice_line_items")
    .select("quantity, unit_price")
    .eq("invoice_id", invoiceId);
  if (linesErr) throw linesErr;

  const discountAed = roundAed(invoice.discount_aed ?? invoice.discount_amount ?? 0);
  const { subtotal, grossTotal, vatAed } = totalsFromLines(lines ?? [], discountAed);
  const amountPaid = await effectiveAmountPaid(invoice);
  const { grandTotal } = invoiceDisplayTotals({
    total: grossTotal,
    total_aed: grossTotal,
    vat_aed: vatAed,
  });
  const status = deriveInvoiceStatusAfterRecalc(invoice.status, amountPaid, grandTotal);

  const updatePayload: Database["public"]["Tables"]["invoices"]["Update"] = {
    subtotal,
    subtotal_aed: subtotal,
    total: grossTotal,
    total_aed: grossTotal,
    vat_aed: vatAed,
    status: status as Database["public"]["Enums"]["invoice_status"],
    amount_paid: amountPaid,
    updated_at: new Date().toISOString(),
  };

  if (status === "paid" && !invoice.paid_at) {
    updatePayload.paid_at = new Date().toISOString();
  }
  if (status !== "paid") {
    updatePayload.paid_at = null;
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId);
  if (updErr) throw updErr;
}
