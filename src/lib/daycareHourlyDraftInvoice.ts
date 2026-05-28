import { format, parseISO } from "date-fns";

import type { ServiceInvoiceLineItem } from "@/lib/bookingUtils";
import type { DaycareInvoicePet } from "@/lib/daycareInvoiceLines";

/**
 * `invoice_line_items.service_type` for $0 placeholder rows on draft daycare invoices
 * created at hourly check-in before Complete Hourly Billing finalises amounts.
 */
export const HOURLY_PLACEHOLDER_SERVICE_TYPE = "daycare_hourly_pending" as const;

export function isHourlyPlaceholderLineItem(serviceType: string | null | undefined): boolean {
  return serviceType === HOURLY_PLACEHOLDER_SERVICE_TYPE;
}

/** Zero-dollar lines staff replace via Complete Hourly Billing or manual edit. */
export function buildHourlyPlaceholderLineItems(args: {
  pets: DaycareInvoicePet[];
  sessionDate: string;
}): ServiceInvoiceLineItem[] {
  const dateLabel = format(parseISO(args.sessionDate), "d MMM yyyy");
  return args.pets.map((pet) => ({
    description: `${pet.name} — Daycare hourly (hours TBD) — ${dateLabel}`,
    quantity: 1,
    unitPrice: 0,
    serviceType: HOURLY_PLACEHOLDER_SERVICE_TYPE,
    preserveUnitPrice: true,
  }));
}
