import { supabase } from "@/integrations/supabase/client";
import { clearHourlyInvoicedFromNotes, HOURLY_INVOICED_PREFIX } from "@/lib/daycareSessionMeta";

/**
 * Run in Supabase SQL Editor: `sql/invoice-deletion-log-insert-policy.sql`
 */
export interface DeleteInvoiceWithLogInput {
  invoiceUuid: string;
  /** Human-readable invoice number for the log row, e.g. INV-2026-00458 */
  invoiceNumberDisplay: string;
  ownerName: string;
  totalAmount: number;
  reason: string;
  deletedByEmail: string;
}

function deleteStepError(step: string, message: string, code?: string): Error {
  const suffix = code ? ` (${code})` : "";
  return new Error(`${step}: ${message}${suffix}`);
}

async function clearDaycareHourlyInvoiceMarkers(invoiceUuid: string): Promise<void> {
  const marker = `${HOURLY_INVOICED_PREFIX}${invoiceUuid}`;
  const { data: sessions, error: fetchErr } = await supabase
    .from("daycare_sessions")
    .select("id, notes")
    .ilike("notes", `%${marker}%`);
  if (fetchErr) {
    throw deleteStepError("Could not load linked daycare sessions", fetchErr.message, fetchErr.code);
  }
  for (const session of sessions ?? []) {
    const { error: updateErr } = await supabase
      .from("daycare_sessions")
      .update({ notes: clearHourlyInvoicedFromNotes(session.notes, invoiceUuid) })
      .eq("id", session.id);
    if (updateErr) {
      throw deleteStepError(
        "Could not clear hourly billing marker on daycare session",
        updateErr.message,
        updateErr.code,
      );
    }
  }
}

export async function deleteInvoiceWithLog(input: DeleteInvoiceWithLogInput): Promise<void> {
  const {
    invoiceUuid,
    invoiceNumberDisplay,
    ownerName,
    totalAmount,
    reason,
    deletedByEmail,
  } = input;

  const { data: invoice, error: fetchInvErr } = await supabase
    .from("invoices")
    .select("id, amount_paid, status")
    .eq("id", invoiceUuid)
    .maybeSingle();
  if (fetchInvErr) {
    throw deleteStepError("Could not load invoice", fetchInvErr.message, fetchInvErr.code);
  }
  if (!invoice) {
    throw new Error("Invoice not found (it may already have been deleted).");
  }
  if (Number(invoice.amount_paid ?? 0) > 0) {
    throw new Error(
      "Cannot delete an invoice with payments recorded. Void the invoice instead, or contact support.",
    );
  }

  const { error: logErr } = await supabase.from("invoice_deletion_log").insert({
    invoice_id: invoiceNumberDisplay,
    invoice_row_id: invoiceUuid,
    owner_name: ownerName,
    total_amount: totalAmount,
    deleted_by: deletedByEmail,
    reason: reason.trim(),
  });
  if (logErr) {
    const hint =
      logErr.code === "42501"
        ? " Ask an admin to run sql/invoice-deletion-log-insert-policy.sql in Supabase."
        : "";
    throw deleteStepError(
      `Could not write deletion audit log${hint}`,
      logErr.message,
      logErr.code,
    );
  }

  await clearDaycareHourlyInvoiceMarkers(invoiceUuid);

  const { error: lineErr } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoiceUuid);
  if (lineErr) {
    throw deleteStepError("Could not delete invoice line items", lineErr.message, lineErr.code);
  }

  const { error: adjErr } = await supabase
    .from("billing_adjustments")
    .delete()
    .eq("invoice_id", invoiceUuid);
  if (adjErr) {
    throw deleteStepError("Could not delete billing adjustments", adjErr.message, adjErr.code);
  }

  const { error: wtErr } = await supabase
    .from("wallet_transactions")
    .update({ invoice_id: null })
    .eq("invoice_id", invoiceUuid);
  if (wtErr) {
    throw deleteStepError("Could not unlink wallet transactions", wtErr.message, wtErr.code);
  }

  const { error: invErr } = await supabase.from("invoices").delete().eq("id", invoiceUuid);
  if (invErr) {
    throw deleteStepError("Could not delete invoice", invErr.message, invErr.code);
  }
}
