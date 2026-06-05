import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { invoiceDueDateToday } from "@/lib/invoiceDueDate";

type Client = SupabaseClient<Database>;

export type MarkInvoiceOutstandingResult = {
  success: boolean;
  error?: string;
};

/**
 * Flip a draft invoice to outstanding (staff override before the normal trigger
 * moment). Audit-logged via invoice_amendments and became_outstanding_* columns.
 */
export async function markInvoiceOutstanding(
  supabase: Client,
  params: {
    invoiceId: string;
    performedBy: string;
    reason: string;
  },
): Promise<MarkInvoiceOutstandingResult> {
  const performedBy = params.performedBy.trim();
  const reason = params.reason.trim();
  if (!performedBy) return { success: false, error: "Staff name is required." };
  if (!reason) return { success: false, error: "A reason is required." };

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, status, due_date")
    .eq("id", params.invoiceId)
    .single();
  if (invErr) return { success: false, error: invErr.message };
  if (invoice.status !== "draft") {
    return { success: false, error: "Only draft invoices can be marked as due." };
  }

  const now = new Date().toISOString();
  const dueDate = invoice.due_date?.trim() || invoiceDueDateToday();

  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      status: "outstanding",
      due_date: dueDate,
      became_outstanding_at: now,
      became_outstanding_by: performedBy,
    })
    .eq("id", params.invoiceId)
    .eq("status", "draft");
  if (updErr) return { success: false, error: updErr.message };

  const { error: logErr } = await supabase.from("invoice_amendments").insert({
    invoice_id: params.invoiceId,
    amended_by: performedBy,
    field_changed: "status",
    old_value: "draft",
    new_value: "outstanding",
    reason,
  });
  if (logErr) return { success: false, error: logErr.message };

  return { success: true };
}
