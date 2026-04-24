import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StatementRow = Database["public"]["Functions"]["get_statement_of_account"]["Returns"][number];

export function useStatementOfAccount(ownerId?: string) {
  return useQuery({
    queryKey: ["statement", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_statement_of_account", {
        p_owner_id: ownerId as string,
      });
      if (error) throw error;
      return (data ?? []) as StatementRow[];
    },
  });
}

export type { StatementRow };
