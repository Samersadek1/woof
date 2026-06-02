import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAccountBalance } from "@/lib/accountBalance";

export const accountBalanceQueryKey = (ownerId?: string) =>
  ["account-balance", ownerId] as const;

/**
 * Live owner account balance = wallet_balance - outstanding invoice debt.
 * Always computed, never stored.
 */
export function useAccountBalance(ownerId?: string) {
  return useQuery({
    queryKey: accountBalanceQueryKey(ownerId),
    enabled: !!ownerId,
    queryFn: () => getAccountBalance(supabase, ownerId as string),
  });
}
