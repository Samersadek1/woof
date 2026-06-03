import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientPaymentSummary } from "@/types/clientPayment";

export const clientPaymentSummaryQueryKey = (ownerId?: string) =>
  ["client-payment-summary", ownerId] as const;

export function useClientPaymentSummary(ownerId?: string) {
  return useQuery({
    queryKey: clientPaymentSummaryQueryKey(ownerId),
    enabled: !!ownerId,
    queryFn: async (): Promise<ClientPaymentSummary> => {
      const { data, error } = await supabase.rpc("get_client_payment_summary", {
        p_owner_id: ownerId as string,
      });
      if (error) throw error;
      return data as unknown as ClientPaymentSummary;
    },
  });
}

export function useLogPaymentReminder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      ownerId: string;
      amountAtTime: number;
      sentBy: string;
      channel?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("payment_reminders").insert({
        owner_id: params.ownerId,
        amount_at_time: params.amountAtTime,
        sent_by: params.sentBy,
        channel: params.channel ?? "whatsapp",
        notes: params.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: clientPaymentSummaryQueryKey(vars.ownerId) });
    },
  });
}
