import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { HOURLY_PLACEHOLDER_SERVICE_TYPE, removeSingleSessionFromDraft } from "@/lib/daycareHourlyDraftInvoice";
import { parseHourlyDraftId } from "@/lib/daycareSessionMeta";

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
  if (hourlyLine && hourlyLine.quantity > 0) {
    const fromDescription = hourlyLine.description?.match(/\(([\d.]+)\s*hr\)/i)?.[1];
    if (fromDescription) {
      const parsed = Number(fromDescription);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return hourlyLine.quantity;
  }
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
 *
 * For hourly sessions linked to a multi-dog draft invoice, only the session's
 * placeholder line is removed rather than voiding the whole invoice (which would
 * affect sibling dogs still checked in).
 */
export async function cancelDaycareCheckIn(sessionId: string): Promise<void> {
  const { data: session, error: sessionErr } = await supabase
    .from("daycare_sessions")
    .select("*, pets(name)")
    .eq("id", sessionId)
    .single();

  if (sessionErr) throw sessionErr;
  if (!session) throw new Error("Session not found");

  const row = session as DaycareSession & { pets: { name: string } | null };
  if (!row.checked_in) {
    throw new Error("This session is not checked in");
  }

  // ── Draft invoice handling (multi-dog aware) ─────────────────────────────
  // Determine if this session is linked to a draft invoice.
  const draftIdFromNotes = parseHourlyDraftId(row.notes);

  // Also check via service_id (primary session of a draft)
  const { data: draftViaServiceId } = await supabase
    .from("invoices")
    .select("id, service_id, status")
    .eq("service_id", sessionId)
    .eq("status", "draft")
    .neq("status", "voided")
    .limit(1);
  const draftIdViaService = draftViaServiceId?.[0]?.id ?? null;
  const draftInvoiceId = draftIdFromNotes ?? draftIdViaService;

  if (draftInvoiceId) {
    // Check how many sessions are still linked to this draft (other than the one being cancelled)
    const draftMarker = `HOURLY_DRAFT:${draftInvoiceId}`;
    const { data: siblings } = await supabase
      .from("daycare_sessions")
      .select("id, notes")
      .ilike("notes", `%${draftMarker}%`)
      .neq("id", sessionId);

    const siblingCount = siblings?.length ?? 0;
    const isPrimary = draftIdViaService === draftInvoiceId;

    // Check if draft has any non-placeholder lines (transport, manual extras)
    const { data: draftLines } = await supabase
      .from("invoice_line_items")
      .select("id, service_type")
      .eq("invoice_id", draftInvoiceId);
    const nonPlaceholderLines = (draftLines ?? []).filter(
      (l) => l.service_type !== HOURLY_PLACEHOLDER_SERVICE_TYPE,
    );

    if (siblingCount > 0 || nonPlaceholderLines.length > 0) {
      // Multi-dog draft or draft has extra lines: remove only this session's placeholder line.
      const petName = (row as { pets: { name: string } | null }).pets?.name ?? "Pet";

      // Find a sibling to promote if this session is the primary
      const promotedSessionId =
        isPrimary && siblings && siblings.length > 0 ? siblings[0].id : undefined;

      await removeSingleSessionFromDraft({
        invoiceId: draftInvoiceId,
        cancelledSessionId: sessionId,
        petName,
        isPrimary,
        promotedSessionId,
      });
    } else {
      // Only this session on the draft and no kept lines — void/delete the whole invoice.
      const { data: fullInvoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", draftInvoiceId)
        .single();
      if (fullInvoice) {
        await voidOrRemoveInvoice(fullInvoice as InvoiceRow);
      }
    }
  }

  // ── Non-draft invoice handling (finalised/paid) ──────────────────────────
  const { data: otherInvoices, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("service_id", sessionId)
    .neq("status", "voided")
    .neq("status", "draft");

  if (invErr) throw invErr;
  for (const invoice of otherInvoices ?? []) {
    await voidOrRemoveInvoice(invoice as InvoiceRow);
  }

  // ── Package credit restore ───────────────────────────────────────────────
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
