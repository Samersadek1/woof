import { useQuery } from "@tanstack/react-query";
import { fetchGroomingManualFeeBounds } from "@/lib/groomingNewAppointmentRates";

export function useGroomingManualFeeBounds(enabled = true) {
  return useQuery({
    queryKey: ["grooming-manual-fee-bounds"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: fetchGroomingManualFeeBounds,
  });
}
