import { differenceInCalendarDays, addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { BillingBreakdown, LineItem, ServiceType } from "@/hooks/useBilling";
import { resolveBoardingRate } from "@/lib/boardingPricing";
import { resolveAddonPricesForKeys } from "@/lib/addonPricing";
import { serviceTypeForBoardingAddonKey } from "@/lib/groomingCatalog";

/**
 * Returns the number of nights between two ISO date strings.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

/** From `booking_items(count)` on list/detail booking queries */
export function bookingBelongingsCount(b: {
  booking_items?: { count: number }[];
}): number {
  return Number(b.booking_items?.[0]?.count ?? 0);
}

/**
 * Returns "PET1, PET2 – SURNAME" in uppercase, truncated to 30 chars.
 */
export function formatBookingCell(petNames: string[], ownerLastName: string): string {
  const pets = petNames.join(", ");
  const full = [pets, ownerLastName]
    .filter(Boolean)
    .join(" – ")
    .toUpperCase();
  return full.length > 30 ? `${full.slice(0, 30)}…` : full;
}

/**
 * Safely joins first + last name, omitting null/undefined parts.
 */
export function ownerDisplayName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(" ") || "—";
}

/**
 * Returns Tailwind CSS classes for a booking status badge.
 */
export function getStatusColour(status: string): string {
  const map: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    checked_in: "bg-green-100 text-green-800 border-green-200",
    checked_out: "bg-gray-100 text-gray-600 border-gray-200",
    enquiry: "bg-yellow-100 text-yellow-800 border-yellow-200",
    cancelled: "bg-red-100 text-red-600 border-red-200",
  };
  return map[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

/**
 * Returns true if the given date falls within the booking's
 * check_in_date (inclusive) to check_out_date (exclusive — checkout day
 * is the departure day, not an occupied night).
 */
export function isBookingOnDate(
  booking: { check_in_date: string; check_out_date: string },
  date: string
): boolean {
  return date >= booking.check_in_date && date < booking.check_out_date;
}

/**
 * Returns all bookings for a specific room that occupy the given date.
 */
export function getBookingsForRoomAndDate(
  bookings: { room_id: string; check_in_date: string; check_out_date: string }[],
  roomId: string,
  date: string
): typeof bookings {
  return bookings.filter(
    (b) => b.room_id === roomId && isBookingOnDate(b, date)
  );
}

/**
 * Returns an array of N date strings (YYYY-MM-DD) starting from startDate.
 */
export function generateDateRange(startDate: string, days: number): string[] {
  const base = parseISO(startDate);
  return Array.from({ length: days }, (_, i) =>
    format(addDays(base, i), "yyyy-MM-dd")
  );
}

// ── Shared auto-invoice creation ─────────────────────────────────────────────

export interface ServiceInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  pricingKey?: string;
  serviceType?: string;
}

export interface CreateServiceInvoiceParams {
  ownerId: string;
  serviceType: ServiceType;
  /** The booking/appointment/package/park-booking id */
  referenceId: string;
  lineItems: ServiceInvoiceLineItem[];
  notes?: string | null;
  invoiceStatus?: "draft" | "finalised";
}

/**
 * Shared invoice creator used by all service flows (boarding, grooming, park,
 * daycare). Applies member discount, writes both `_aed` and non-suffixed
 * columns for backwards compatibility, and creates line items.
 */
export async function createServiceInvoice(params: CreateServiceInvoiceParams): Promise<string> {
  const {
    ownerId,
    serviceType,
    referenceId,
    lineItems,
    notes,
    invoiceStatus = "draft",
  } = params;

  const subtotal = lineItems.reduce((s, li) => s + li.unitPrice * li.quantity, 0);

  let discountPct = 0;
  let discountAed = 0;
  let total = subtotal;

  try {
    const { data: discData } = await supabase.rpc("apply_member_discount", {
      p_owner_id: ownerId,
      p_subtotal: subtotal,
    });
    const disc = (discData as { discount_pct: number; discount_aed: number; final_aed: number }[])?.[0];
    if (disc) {
      discountPct = disc.discount_pct;
      discountAed = disc.discount_aed;
      total = disc.final_aed;
    }
  } catch {
    // RPC may not exist yet — proceed without discount
  }

  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const isBoardingReference = serviceType === "boarding";

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      owner_id: ownerId,
      // booking_id is FK-bound to bookings. Non-boarding services should link
      // via service_id to avoid FK failures on appointment/session/package ids.
      booking_id: isBoardingReference ? referenceId : null,
      service_id: referenceId,
      service_type: serviceType,
      status: invoiceStatus,
      subtotal,
      subtotal_aed: subtotal,
      discount_pct: discountPct,
      discount_aed: discountAed,
      discount_amount: discountAed,
      total,
      total_aed: total,
      due_date: dueDate,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (invErr) throw invErr;

  const lineRows = lineItems.map((li, i) => ({
    invoice_id: inv.id,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    total_price: li.unitPrice * li.quantity,
    pricing_key: li.pricingKey ?? null,
    service_type: li.serviceType ?? serviceType,
    sort_order: i,
  }));

  if (lineRows.length > 0) {
    const { error: liErr } = await supabase.from("invoice_line_items").insert(lineRows);
    if (liErr) throw liErr;
  }

  return inv.id;
}

// ── Boarding-specific invoice helper ─────────────────────────────────────────

function occupancyTag(petCount: number): string {
  if (petCount <= 1) return "single";
  if (petCount === 2) return "twin";
  return "multiple";
}

interface AutoInvoiceParams {
  bookingId: string;
  ownerId: string;
  serviceType: ServiceType;
  roomId: string;
  roomType: string;
  roomName?: string;
  petCount: number;
  checkInDate: string;
  checkOutDate: string;
  addons?: { key: string; label: string; quantity?: number }[];
}

export async function createBookingInvoice(params: AutoInvoiceParams): Promise<void> {
  const { bookingId, ownerId, roomId, roomType, roomName, petCount, checkInDate, checkOutDate, addons = [] } = params;

  const nights = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  if (nights <= 0) return;

  const [addonPriceMap, rateResolved] = await Promise.all([
    resolveAddonPricesForKeys(addons.map((a) => a.key)),
    resolveBoardingRate(roomId, petCount),
  ]);

  const occ = occupancyTag(petCount);
  const nightlyRate = rateResolved.unitPrice;

  const typeLabel = roomType.replace(/_/g, " ");
  const occLabel = petCount > 1 ? ` (${occ})` : "";
  const lineLabel = roomName
    ? `${roomName} — ${typeLabel}${occLabel} — ${nights} night${nights !== 1 ? "s" : ""}`
    : `${typeLabel}${occLabel} — ${nights} night${nights !== 1 ? "s" : ""}`;

  const lineItems: ServiceInvoiceLineItem[] = [{
    description: lineLabel,
    quantity: nights,
    unitPrice: nightlyRate,
    pricingKey: rateResolved.pricingKey,
    serviceType: "boarding",
  }];

  for (const addon of addons) {
    const rate = addonPriceMap.get(addon.key) ?? 0;
    const qty = Math.max(1, addon.quantity ?? 1);
    lineItems.push({
      description: addon.label,
      quantity: qty,
      unitPrice: rate,
      pricingKey: addon.key,
      serviceType: serviceTypeForBoardingAddonKey(addon.key),
    });
  }

  await createServiceInvoice({
    ownerId,
    serviceType: "boarding",
    referenceId: bookingId,
    lineItems,
  });
}
