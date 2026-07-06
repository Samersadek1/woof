import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchLedgerClosingK } from "@/lib/ledgerClosingBalance";

export const ledgerClosingQueryKey = (ownerId?: string) =>
  ["ledger_closing", ownerId] as const;

export function useLedgerClosing(ownerId?: string) {
  return useQuery({
    queryKey: ledgerClosingQueryKey(ownerId),
    enabled: !!ownerId,
    queryFn: () => fetchLedgerClosingK(supabase, ownerId as string),
  });
}
