import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Maps daycare session id → non-voided invoice id (via service_id on invoices). */
export function useDaycareSessionInvoiceMap(sessionIds: string[]) {
  return useQuery({
    queryKey: ["daycare_sessions", "invoice_map", sessionIds],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, service_id")
        .in("service_id", sessionIds)
        .neq("status", "voided")
        .neq("status", "consolidated");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.service_id) map.set(row.service_id, row.id);
      }
      return map;
    },
  });
}
