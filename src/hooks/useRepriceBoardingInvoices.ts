import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listBoardingBookingsWithInvoice,
  repriceAllBoardingInvoices,
  type RepriceBoardingInvoicesResult,
} from "@/lib/boardingInvoiceSync";

export const BOARDING_REPRICE_INVOICES_QUERY_KEY = ["boarding", "reprice-invoices"] as const;

export function useBoardingBookingsWithInvoiceCount() {
  return useQuery({
    queryKey: BOARDING_REPRICE_INVOICES_QUERY_KEY,
    queryFn: listBoardingBookingsWithInvoice,
    select: (rows) => rows.length,
    staleTime: 60_000,
  });
}

export function useRepriceBoardingInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (onProgress?: (done: number, total: number) => void) =>
      repriceAllBoardingInvoices({ onProgress }),
    onSuccess: (result: RepriceBoardingInvoicesResult) => {
      queryClient.invalidateQueries({ queryKey: BOARDING_REPRICE_INVOICES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["boarding", "missing-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      return result;
    },
  });
}
