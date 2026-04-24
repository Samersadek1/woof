import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardMetrics } from "@/types/dashboard";

export function useDashboardMetrics(asOf: string) {
  return useQuery({
    queryKey: ["dashboard-metrics", asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_metrics", {
        p_as_of: asOf,
      });

      if (error) throw error;
      return data as DashboardMetrics;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
