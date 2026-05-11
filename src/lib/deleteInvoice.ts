import { supabase } from "@/integrations/supabase/client";

/**
 * Run in Supabase SQL Editor / migrations:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS invoice_deletion_log (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   invoice_id text,
 *   owner_name text,
 *   total_amount numeric,
 *   deleted_at timestamptz DEFAULT now(),
 *   deleted_by text,
 *   reason text
 * );
 * ```
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

export async function deleteInvoiceWithLog(input: DeleteInvoiceWithLogInput): Promise<void> {
  const {
    invoiceUuid,
    invoiceNumberDisplay,
    ownerName,
    totalAmount,
    reason,
    deletedByEmail,
  } = input;

  const { error: lineErr } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoiceUuid);
  if (lineErr) throw lineErr;

  const { error: adjErr } = await supabase.from("billing_adjustments").delete().eq("invoice_id", invoiceUuid);
  if (adjErr) throw adjErr;

  const { error: wtErr } = await supabase
    .from("wallet_transactions")
    .update({ invoice_id: null })
    .eq("invoice_id", invoiceUuid);
  if (wtErr) throw wtErr;

  const { error: invErr } = await supabase.from("invoices").delete().eq("id", invoiceUuid);
  if (invErr) throw invErr;

  const { error: logErr } = await supabase.from("invoice_deletion_log").insert({
    invoice_id: invoiceNumberDisplay,
    owner_name: ownerName,
    total_amount: totalAmount,
    deleted_by: deletedByEmail,
    reason: reason.trim(),
  });
  if (logErr) throw logErr;
}
