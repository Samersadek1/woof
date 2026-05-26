import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildBoardingNightLineItems, type BoardingInvoiceLineItem } from "@/lib/boardingInvoiceLines";
import {
  deriveInvoiceStatusAfterRecalc,
  isBoardingNightLineItem,
} from "@/lib/boardingInvoiceLineUtils";
import { createBookingInvoice } from "@/lib/bookingUtils";
import { formatAed, roundAed } from "@/lib/money";
import { invoiceDisplayTotals, vatAmountFromGrossInclusive } from "@/lib/vatConfig";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type LineRow = Database["public"]["Tables"]["invoice_line_items"]["Row"];

const PAYMENT_TX_TYPES = new Set([
  "cash_payment",
  "card_payment",
  "deduction",
]);

export type SyncBoardingInvoiceResult =
  | { kind: "no_invoice" }
  | { kind: "skipped"; reason: string }
  | { kind: "created"; invoiceId: string }
  | {
      kind: "updated";
      invoiceId: string;
      grandTotal: number;
      amountPaid: number;
      outstanding: number;
      status: string;
    };

export { isBoardingNightLineItem, deriveInvoiceStatusAfterRecalc } from "@/lib/boardingInvoiceLineUtils";

function lineRowToServiceItem(row: LineRow): BoardingInvoiceLineItem {
  return {
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    pricingKey: row.pricing_key ?? undefined,
    serviceType: row.service_type ?? undefined,
    preserveUnitPrice: true,
  };
}

function totalsFromLineItems(
  lineItems: BoardingInvoiceLineItem[],
  discountAed: number,
): { subtotal: number; grossTotal: number; vatAed: number } {
  const subtotal = lineItems.reduce((s, li) => s + li.unitPrice * Math.max(1, li.quantity), 0);
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

async function loadBookingForInvoice(bookingId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, owner_id, room_id, check_in_date, check_out_date, status, rooms(room_number, display_name, room_type), booking_pets(pet_id)",
    )
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Re-price boarding night lines on the booking's invoice after check-in/out date edits.
 * Preserves non-night lines (transport, grooming add-ons, etc.) and paid amounts.
 */
export async function syncBoardingBookingInvoice(
  bookingId: string,
): Promise<SyncBoardingInvoiceResult> {
  const booking = await loadBookingForInvoice(bookingId);
  if (!booking?.owner_id) {
    return { kind: "skipped", reason: "Booking has no owner" };
  }
  if (booking.status === "cancelled") {
    return { kind: "skipped", reason: "Cancelled booking" };
  }

  const { data: invoices, error: invListErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("booking_id", bookingId)
    .neq("status", "voided")
    .order("created_at", { ascending: false })
    .limit(1);

  if (invListErr) throw invListErr;

  const invoice = (invoices ?? [])[0] as InvoiceRow | undefined;
  const room = booking.rooms as { room_number?: string; display_name?: string; room_type?: string } | null;
  const petCount = Math.max(1, (booking.booking_pets ?? []).length);

  if (!invoice) {
    await createBookingInvoice({
      bookingId,
      ownerId: booking.owner_id,
      serviceType: "boarding",
      roomId: booking.room_id,
      roomType: room?.room_type ?? "boarding",
      roomName: room?.room_number ?? room?.display_name ?? undefined,
      petCount,
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
    });
    const { data: created } = await supabase
      .from("invoices")
      .select("id")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return created?.id
      ? { kind: "created", invoiceId: created.id }
      : { kind: "no_invoice" };
  }

  const { data: existingLines, error: linesErr } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (linesErr) throw linesErr;

  const preserved = (existingLines ?? []).filter((row) => !isBoardingNightLineItem(row));
  const nightLines = await buildBoardingNightLineItems({
    roomId: booking.room_id,
    roomName: room?.room_number ?? room?.display_name ?? undefined,
    petCount,
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
  });

  const merged: BoardingInvoiceLineItem[] = [...nightLines, ...preserved.map(lineRowToServiceItem)];
  const discountAed = roundAed(invoice.discount_aed ?? invoice.discount_amount ?? 0);
  const { subtotal, grossTotal, vatAed } = totalsFromLineItems(merged, discountAed);
  const amountPaid = await effectiveAmountPaid(invoice);
  const { grandTotal } = invoiceDisplayTotals({
    total: grossTotal,
    total_aed: grossTotal,
    vat_aed: vatAed,
  });
  const outstanding = roundAed(Math.max(0, grandTotal - amountPaid));
  const status = deriveInvoiceStatusAfterRecalc(invoice.status, amountPaid, grandTotal);

  const { error: delErr } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoice.id);
  if (delErr) throw delErr;

  const lineRows = merged.map((li, i) => ({
    invoice_id: invoice.id,
    description: li.description,
    quantity: Math.max(1, li.quantity),
    unit_price: li.unitPrice,
    total_price: li.unitPrice * Math.max(1, li.quantity),
    pricing_key: li.pricingKey ?? null,
    service_type: li.serviceType ?? "boarding",
    sort_order: i,
  }));

  if (lineRows.length > 0) {
    const { error: insErr } = await supabase.from("invoice_line_items").insert(lineRows);
    if (insErr) throw insErr;
  }

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
    .eq("id", invoice.id);
  if (updErr) throw updErr;

  const { error: occupancyErr } = await supabase.rpc("apply_double_occupancy_discount", {
    p_booking_id: bookingId,
  });
  if (occupancyErr) throw occupancyErr;

  const { data: refreshedInvoice, error: refreshErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoice.id)
    .single();
  if (refreshErr) throw refreshErr;

  const refreshedGrossTotal = roundAed(refreshedInvoice.total ?? grossTotal);
  const refreshedVatAed = roundAed(refreshedInvoice.vat_aed ?? vatAed);
  const { grandTotal: refreshedGrandTotal } = invoiceDisplayTotals({
    total: refreshedGrossTotal,
    total_aed: refreshedGrossTotal,
    vat_aed: refreshedVatAed,
  });
  const refreshedOutstanding = roundAed(Math.max(0, refreshedGrandTotal - amountPaid));
  const refreshedStatus = deriveInvoiceStatusAfterRecalc(
    refreshedInvoice.status,
    amountPaid,
    refreshedGrandTotal,
  );

  return {
    kind: "updated",
    invoiceId: invoice.id,
    grandTotal: refreshedGrandTotal,
    amountPaid,
    outstanding: refreshedOutstanding,
    status: refreshedStatus,
  };
}

export function formatSyncBoardingInvoiceToast(result: SyncBoardingInvoiceResult): string {
  if (result.kind === "updated") {
    if (result.outstanding <= 0) {
      return `Invoice updated (${formatAed(result.grandTotal)} total, paid in full).`;
    }
    return `Invoice updated — ${formatAed(result.outstanding)} outstanding (${formatAed(result.amountPaid)} paid).`;
  }
  if (result.kind === "created") return "Draft invoice created for this stay.";
  if (result.kind === "skipped") return result.reason;
  return "Stay dates saved (no invoice on this booking).";
}
