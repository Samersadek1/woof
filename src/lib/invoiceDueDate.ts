import { format } from "date-fns";

import { getSupabase } from "@/lib/supabaseRuntime";
import { withoutSupersededInvoices } from "@/lib/invoiceStatus";

/** Normalise any ISO or YYYY-MM-DD string to a date-only due date. */
export function invoiceDueDateAtCheckIn(checkInDate: string): string {
  return checkInDate.slice(0, 10);
}

/** Counter / walk-in invoices with no booking: due today. */
export function invoiceDueDateToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Set due_date on all non-voided invoices linked to a boarding booking.
 * Payment is due on the (planned or actual) check-in date.
 */
export async function syncInvoiceDueDateForBooking(
  bookingId: string,
  checkInDate: string,
): Promise<void> {
  const dueDate = invoiceDueDateAtCheckIn(checkInDate);
  const { error } = await withoutSupersededInvoices(
    getSupabase()
      .from("invoices")
      .update({ due_date: dueDate })
      .eq("booking_id", bookingId),
  );
  if (error) throw error;
}
