import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  backfillBoardingInvoicesMissing,
  listBoardingBookingsMissingInvoice,
  type BackfillBoardingInvoicesResult,
} from "@/lib/boardingInvoiceSync";

export const BOARDING_MISSING_INVOICE_QUERY_KEY = ["boarding", "missing-invoices"] as const;

export function useBoardingBookingsMissingInvoiceCount() {
  return useQuery({
    queryKey: BOARDING_MISSING_INVOICE_QUERY_KEY,
    queryFn: listBoardingBookingsMissingInvoice,
    select: (rows) => rows.length,
    staleTime: 60_000,
  });
}

export function useBackfillBoardingInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (onProgress?: (done: number, total: number) => void) =>
      backfillBoardingInvoicesMissing({ onProgress }),
    onSuccess: (result: BackfillBoardingInvoicesResult) => {
      queryClient.invalidateQueries({ queryKey: BOARDING_MISSING_INVOICE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      return result;
    },
  });
}
