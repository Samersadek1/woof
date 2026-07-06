import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { closingKFromLedger, type LedgerRowLike } from "@/lib/ownerBalances";
import { getDubaiDayUtcEndInclusive, getDubaiDayUtcStart } from "@/lib/statementDates";
import { loadLedgerStatementClient } from "@/lib/ledgerStatementClient";

type Client = SupabaseClient<Database>;

/** Wide-window ledger fetch used only to read closing K. */
export async function fetchLedgerClosingK(
  supabase: Client,
  ownerId: string,
): Promise<number> {
  const fromIso = getDubaiDayUtcStart("2000-01-01");
  const toIso = getDubaiDayUtcEndInclusive(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()),
  );

  const { data, error } = await supabase.rpc("get_ledger_statement", {
    p_owner_id: ownerId,
    p_from: fromIso,
    p_to: toIso,
  });

  const rows = error
    ? await loadLedgerStatementClient(supabase, ownerId, fromIso, toIso)
    : ((data ?? []) as LedgerRowLike[]);
  if (rows.length === 0) return 0;
  return closingKFromLedger(rows);
}
