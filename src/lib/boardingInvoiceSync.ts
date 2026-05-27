import { differenceInCalendarDays, parseISO } from "date-fns";

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
      "id, owner_id, room_id, check_in_date, check_out_date, status, rooms(room_number, display_name, room_type), booking_pets(pet_id, pets(name))",
    )
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return data;
}

function bookingPetsForInvoice(
  bookingPets: Array<{ pet_id: string; pets: { name: string } | null }> | null | undefined,
): { id: string; name: string }[] {
  return (bookingPets ?? []).map((bp) => ({
    id: bp.pet_id,
    name: bp.pets?.name ?? "Pet",
  }));
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
  const pets = bookingPetsForInvoice(
    booking.booking_pets as Array<{ pet_id: string; pets: { name: string } | null }> | null,
  );
  const petCount = Math.max(1, pets.length);

  if (!invoice) {
    await createBookingInvoice({
      bookingId,
      ownerId: booking.owner_id,
      serviceType: "boarding",
      roomId: booking.room_id,
      roomType: room?.room_type ?? "boarding",
      roomName: room?.room_number ?? room?.display_name ?? undefined,
      petCount,
      pets,
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
    pets,
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

export type BoardingBookingMissingInvoice = {
  id: string;
  booking_ref: string | null;
};

export type BackfillBoardingInvoicesResult = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: { id: string; bookingRef: string | null; message: string }[];
};

/** Active boarding stays with no non-voided invoice (eligible for draft invoice creation). */
export async function listBoardingBookingsMissingInvoice(): Promise<BoardingBookingMissingInvoice[]> {
  const { data: invoicedRows, error: invErr } = await supabase
    .from("invoices")
    .select("booking_id")
    .not("booking_id", "is", null)
    .neq("status", "voided");
  if (invErr) throw invErr;

  const invoicedBookingIds = new Set(
    (invoicedRows ?? []).map((row) => row.booking_id).filter(Boolean) as string[],
  );

  const { data: bookings, error: bookErr } = await supabase
    .from("bookings")
    .select("id, booking_ref, owner_id, check_in_date, check_out_date, status")
    .eq("booking_type", "boarding")
    .neq("status", "cancelled")
    .not("owner_id", "is", null)
    .order("check_in_date", { ascending: true });
  if (bookErr) throw bookErr;

  return (bookings ?? [])
    .filter((b) => {
      if (invoicedBookingIds.has(b.id)) return false;
      const nights = differenceInCalendarDays(
        parseISO(b.check_out_date),
        parseISO(b.check_in_date),
      );
      return nights > 0;
    })
    .map((b) => ({ id: b.id, booking_ref: b.booking_ref }));
}

export type BackfillBoardingInvoicesOptions = {
  onProgress?: (done: number, total: number) => void;
};

/** Create draft invoices for boarding stays that do not have one yet. */
export async function backfillBoardingInvoicesMissing(
  options: BackfillBoardingInvoicesOptions = {},
): Promise<BackfillBoardingInvoicesResult> {
  const targets = await listBoardingBookingsMissingInvoice();
  const total = targets.length;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors: BackfillBoardingInvoicesResult["errors"] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    options.onProgress?.(i + 1, total);
    try {
      const result = await syncBoardingBookingInvoice(target.id);
      if (result.kind === "created") {
        created += 1;
      } else if (result.kind === "skipped" || result.kind === "updated") {
        skipped += 1;
      } else if (result.kind === "no_invoice") {
        failed += 1;
        errors.push({
          id: target.id,
          bookingRef: target.booking_ref,
          message: "Invoice was not created",
        });
      }
    } catch (err) {
      failed += 1;
      errors.push({
        id: target.id,
        bookingRef: target.booking_ref,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  options.onProgress?.(total, total);

  return { total, created, skipped, failed, errors };
}
