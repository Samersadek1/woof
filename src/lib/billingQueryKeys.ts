import type { QueryClient } from "@tanstack/react-query";

/** Invalidate all React Query caches that depend on service_rates / pricing admin. */
export function invalidateServiceRatesQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["pricing"] });
  queryClient.invalidateQueries({ queryKey: ["grooming-rates"] });
  queryClient.invalidateQueries({ queryKey: ["addon_rates"] });
  queryClient.invalidateQueries({ queryKey: ["package_definitions", "rates_view"] });
}
