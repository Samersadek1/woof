import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DaycareSession = Database["public"]["Tables"]["daycare_sessions"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

async function creditUnitsToRestore(
  sessionId: string,
  creditId: string,
  serviceCode: string,
): Promise<number> {
  if (serviceCode !== "daycare_hourly") return 1;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("service_id", sessionId)
    .neq("status", "voided")
    .limit(1);

  const invoiceId = invoices?.[0]?.id;
  if (!invoiceId) return 1;

  const { data: lines } = await supabase
    .from("invoice_line_items")
    .select("quantity, description")
    .eq("invoice_id", invoiceId);

  const hourlyLine = (lines ?? []).find((line) => /hourly/i.test(line.description ?? ""));
  if (hourlyLine && hourlyLine.quantity > 0) return hourlyLine.quantity;
  return 1;
}

async function voidOrRemoveInvoice(invoice: InvoiceRow): Promise<void> {
  const paid = Number(invoice.amount_paid ?? 0);
  if (paid > 0) {
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "voided",
        voided_reason: "Daycare check-in cancelled",
        voided_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    if (error) throw error;
    return;
  }

  const { error: lineErr } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoice.id);
  if (lineErr) throw lineErr;

  const { error: invErr } = await supabase.from("invoices").delete().eq("id", invoice.id);
  if (invErr) throw invErr;
}

/**
 * Undo a daycare check-in: void/remove linked invoice(s), restore package credit, delete session.
 */
export async function cancelDaycareCheckIn(sessionId: string): Promise<void> {
  const { data: session, error: sessionErr } = await supabase
    .from("daycare_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionErr) throw sessionErr;
  if (!session) throw new Error("Session not found");

  const row = session as DaycareSession;
  if (!row.checked_in) {
    throw new Error("This session is not checked in");
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("service_id", sessionId)
    .neq("status", "voided");

  if (invErr) throw invErr;
  for (const invoice of invoices ?? []) {
    await voidOrRemoveInvoice(invoice as InvoiceRow);
  }

  if (row.package_id) {
    const { data: credit, error: creditErr } = await supabase
      .from("service_credits")
      .select("id, service_code, units_consumed")
      .eq("id", row.package_id)
      .maybeSingle();

    if (creditErr) throw creditErr;
    if (credit && credit.units_consumed > 0) {
      const units = await creditUnitsToRestore(sessionId, credit.id, credit.service_code);
      const { error: restoreErr } = await supabase.rpc("restore_service_credit", {
        p_credit_id: credit.id,
        p_units: units,
      });
      if (restoreErr) {
        throw new Error(
          `Could not restore package credit (${restoreErr.message}). Apply migration restore_service_credit if missing.`,
        );
      }
    }
  }

  const { error: deleteErr } = await supabase.from("daycare_sessions").delete().eq("id", sessionId);
  if (deleteErr) throw deleteErr;
}
