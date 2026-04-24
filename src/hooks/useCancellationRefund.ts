import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type RefundRow = Database["public"]["Functions"]["calculate_cancellation_refund"]["Returns"][number];

export function useCancellationRefundPreview(
  ownerId?: string,
  invoiceId?: string,
  serviceStart?: string,
) {
  return useQuery({
    queryKey: ["cancellation_refund_preview", ownerId, invoiceId, serviceStart],
    enabled: !!ownerId && !!invoiceId && !!serviceStart,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calculate_cancellation_refund", {
        p_owner_id: ownerId as string,
        p_invoice_id: invoiceId as string,
        p_service_start: serviceStart as string,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as RefundRow | null;
    },
  });
}

export type { RefundRow };
