import { differenceInCalendarDays, addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { BillingBreakdown, LineItem, ServiceType } from "@/hooks/useBilling";

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

// ── Auto-invoice creation for new bookings ──────────────────────────────────

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
  addons?: { key: string; label: string }[];
}

function occupancyTag(petCount: number): string {
  if (petCount <= 1) return "single";
  if (petCount === 2) return "twin";
  return "multiple";
}

export async function createBookingInvoice(params: AutoInvoiceParams): Promise<void> {
  const { bookingId, ownerId, serviceType, roomId, roomType, roomName, petCount, checkInDate, checkOutDate, addons = [] } = params;

  const nights = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  if (nights <= 0) return;

  const [{ data: pricingRows }, { data: roomRow }] = await Promise.all([
    supabase.from("pricing").select("key, amount_aed"),
    supabase.from("rooms").select("nightly_rate, capacity_type").eq("id", roomId).single(),
  ]);

  const prices: Record<string, number> = {};
  for (const r of pricingRows ?? []) prices[r.key] = r.amount_aed;

  const occ = occupancyTag(petCount);
  const capacityType = roomRow?.capacity_type ?? occ;

  // Priority order: service-prefixed keys first (e.g. boarding_presidential_suite_twin),
  // then fall back to shorter variants
  const candidates = [
    `${serviceType}_${roomType}_${occ}`,
    `${serviceType}_${roomType}_${capacityType}`,
    `${serviceType}_${roomType}`,
    `${serviceType}_${roomType}_nightly`,
    `${roomType}_${occ}`,
    `${roomType}_${capacityType}`,
    `${roomType}_${occ}_nightly`,
    `${roomType}_${capacityType}_nightly`,
    roomType,
    `${roomType}_nightly`,
  ];
  const pricingTableRate = candidates.reduce<number | undefined>((found, k) => found ?? prices[k], undefined);
  const matchedKey = candidates.find((k) => k in prices) ?? `${serviceType}_${roomType}_${occ}`;

  const nightlyRate = pricingTableRate ?? roomRow?.nightly_rate ?? 0;

  const typeLabel = roomType.replace(/_/g, " ");
  const occLabel = petCount > 1 ? ` (${occ})` : "";
  const lineLabel = roomName
    ? `${roomName} — ${typeLabel}${occLabel} — ${nights} night${nights !== 1 ? "s" : ""}`
    : `${typeLabel}${occLabel} — ${nights} night${nights !== 1 ? "s" : ""}`;
  const lineItems: LineItem[] = [{
    pricingKey: matchedKey,
    label: lineLabel,
    quantity: nights,
    unitPrice: nightlyRate,
    total: nightlyRate * nights,
  }];

  for (const addon of addons) {
    const rate = prices[addon.key] ?? 0;
    lineItems.push({ pricingKey: addon.key, label: addon.label, quantity: 1, unitPrice: rate, total: rate });
  }

  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);

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
    // RPC may not exist yet if migration hasn't been run — proceed without discount
  }

  const { data: ownerData } = await supabase.from("owners").select("member_type").eq("id", ownerId).single();

  const breakdown: BillingBreakdown = {
    lineItems,
    subtotal,
    discountPct,
    discountAed,
    total,
    memberType: ownerData?.member_type ?? "standard",
  };

  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      owner_id: ownerId,
      service_type: serviceType,
      service_id: bookingId,
      status: "draft" as const,
      subtotal_aed: breakdown.subtotal,
      subtotal: breakdown.subtotal,
      discount_pct: breakdown.discountPct,
      discount_aed: breakdown.discountAed,
      discount_amount: breakdown.discountAed,
      total_aed: breakdown.total,
      total: breakdown.total,
      due_date: dueDate,
      notes: null,
    })
    .select("id")
    .single();

  if (invErr) throw invErr;

  const lineRows = breakdown.lineItems.map((li, idx) => ({
    invoice_id: inv.id,
    pricing_key: li.pricingKey,
    description: li.label,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    line_total: li.total,
    total_price: li.total,
    sort_order: idx,
  }));

  if (lineRows.length > 0) {
    const { error: liErr } = await supabase.from("invoice_line_items").insert(lineRows);
    if (liErr) throw liErr;
  }
}
