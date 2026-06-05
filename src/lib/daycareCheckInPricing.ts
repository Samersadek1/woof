import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DAYCARE_HOURLY_UNIT_KEY,
  DAYCARE_SINGLE_DAY_PRICING_KEYS,
} from "@/lib/servicePricing";

type PricingTableRow = { key: string; amount_aed: number };

/** Load single-day multi-dog rates from `pricing` plus RPC fallbacks for 1-dog rates. */
export async function fetchDaycareCheckInPriceRows(
  supabase: SupabaseClient,
): Promise<PricingTableRow[]> {
  const rateCardKeys = [...DAYCARE_SINGLE_DAY_PRICING_KEYS];

  const [singleRpc, hourlyRpc, pricingRes] = await Promise.all([
    supabase.rpc("resolve_woof_service_rate", { p_service_code: "daycare_full_day" }),
    supabase.rpc("resolve_woof_service_rate", { p_service_code: "daycare_hourly" }),
    // `pricing` table is live on the project; not yet in generated TS types.
    supabase.from("pricing" as never).select("key, amount_aed").in("key", rateCardKeys as never),
  ]);

  if (singleRpc.error) throw singleRpc.error;
  if (hourlyRpc.error) throw hourlyRpc.error;

  const byKey = new Map<string, number>();

  if (!pricingRes.error && pricingRes.data) {
    for (const row of pricingRes.data as unknown as PricingTableRow[]) {
      const amount = Number(row.amount_aed);
      if (amount > 0) byKey.set(row.key, amount);
    }
  }

  const singleFromRpc =
    (singleRpc.data as { amount_aed: number }[] | null)?.[0]?.amount_aed ?? 0;
  const hourlyFromRpc =
    (hourlyRpc.data as { amount_aed: number }[] | null)?.[0]?.amount_aed ?? 0;

  if (!byKey.has("daycare_single_day") && singleFromRpc > 0) {
    byKey.set("daycare_single_day", singleFromRpc);
  }
  if (!byKey.has(DAYCARE_HOURLY_UNIT_KEY) && hourlyFromRpc > 0) {
    byKey.set(DAYCARE_HOURLY_UNIT_KEY, hourlyFromRpc);
  }

  return Array.from(byKey.entries()).map(([key, amount_aed]) => ({ key, amount_aed }));
}
