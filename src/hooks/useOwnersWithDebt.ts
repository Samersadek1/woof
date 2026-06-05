import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ownersWithDebtQueryKey = () => ["owners-with-debt"] as const;

export interface OwnerWithCollectableDebt {
  owner_id: string;
  owner_name: string;
  phone: string | null;
  due_now: number;
  invoice_count: number;
  oldest_due_date: string | null;
  max_days_overdue: number;
  in_progress: number;
  wallet_credit: number;
  last_reminder_at: string | null;
}

export function useOwnersWithDebt() {
  return useQuery({
    queryKey: ownersWithDebtQueryKey(),
    queryFn: async (): Promise<OwnerWithCollectableDebt[]> => {
      const { data, error } = await supabase.rpc("get_owners_with_collectable_debt");
      if (error) throw error;
      return (data ?? []) as OwnerWithCollectableDebt[];
    },
  });
}
