import { useQuery } from "@tanstack/react-query";
import { getInvoiceLedger } from "@/services/invoiceService";

export const invoiceLedgerQueryKey = (invoiceId?: string) =>
  ["invoice-ledger", invoiceId] as const;

/**
 * Loads the unified invoice ledger (line items, invoice_payments, opening
 * balance snapshot, amendment history, computed closing balance) for the new
 * invoicing model. Read-only aggregate; mutations go through invoiceService.
 */
export function useInvoiceLedger(invoiceId?: string) {
  return useQuery({
    queryKey: invoiceLedgerQueryKey(invoiceId),
    enabled: !!invoiceId,
    queryFn: () => getInvoiceLedger(invoiceId as string),
  });
}
