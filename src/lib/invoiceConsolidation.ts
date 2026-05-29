import type { Database } from "@/integrations/supabase/types";

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

/** Open invoice statuses eligible for owner consolidation (matches DB RPC). */
export const CONSOLIDATABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "finalised",
  "issued",
  "outstanding",
  "overdue",
  "partially_paid",
];

export function canConsolidateInvoiceStatus(status: InvoiceStatus): boolean {
  return CONSOLIDATABLE_INVOICE_STATUSES.includes(status);
}
