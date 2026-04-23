import { supabase } from "@/integrations/supabase/client";

/**
 * Maps `grooming_service` enum / UI values → `pricing.key` (April 2026 rate card).
 * Labels and service lists for the app live in `groomingCatalog.ts` — keep keys in sync
 * with Boarding “groom on checkout” (see `boardCheckoutGroomingAddon`).
 */
export const GROOMING_SERVICE_TO_PRICING_KEY: Record<string, string> = {
  full_groom: "grooming_grande_s",
  full_bath: "grooming_full_bath",
  nail_clip: "grooming_nail_clip",
  deshedding: "grooming_deshed_smooth_s",
  pawdicure: "grooming_pawdicure",
  // brushing: no single rate-card line — use `grooming_service_rates` only
};

export const GROOMING_PRICING_FALLBACK_KEYS = [...new Set(Object.values(GROOMING_SERVICE_TO_PRICING_KEY))];

export function groomingServiceToPricingKey(service: string): string | undefined {
  return GROOMING_SERVICE_TO_PRICING_KEY[service];
}

/** Legacy `addon_rates.addon_type` values that differ from `pricing.key` naming. */
const ADDON_TYPE_FALLBACK: Record<string, string> = {
  grooming_full_groom: "grooming_full",
  grooming_full_bath: "grooming_bath",
};

/**
 * Canonical amounts live in `pricing` (rate card / Billing → legacy pricing keys).
 * `addon_rates` is a fallback when a key exists only there (older data).
 */
export async function resolveAddonPricesForKeys(keys: string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(keys.filter(Boolean))];
  const out = new Map<string, number>();
  if (uniq.length === 0) return out;

  const pricingLookupKeys = uniq.flatMap((k) => [k, ADDON_TYPE_FALLBACK[k]].filter(Boolean));
  const { data: pricingRows, error: pErr } = await supabase
    .from("pricing")
    .select("key, amount_aed")
    .in("key", [...new Set(pricingLookupKeys)] as string[]);
  if (pErr) throw pErr;

  const priceByKey = new Map((pricingRows ?? []).map((r) => [r.key, r.amount_aed]));

  for (const k of uniq) {
    const direct = priceByKey.get(k);
    if (typeof direct === "number") {
      out.set(k, direct);
      continue;
    }
    const mapped = ADDON_TYPE_FALLBACK[k] ? priceByKey.get(ADDON_TYPE_FALLBACK[k]) : undefined;
    if (typeof mapped === "number") out.set(k, mapped);
  }

  const missing = uniq.filter((k) => !out.has(k));
  if (missing.length === 0) return out;

  const addonTypes = missing.flatMap((k) => [k, ADDON_TYPE_FALLBACK[k]].filter(Boolean));
  const { data: addonRows, error: aErr } = await supabase
    .from("addon_rates")
    .select("addon_type, price_aed")
    .in("addon_type", [...new Set(addonTypes)] as string[])
    .eq("is_active", true);
  if (aErr) throw aErr;

  const addonMap = new Map((addonRows ?? []).map((r) => [r.addon_type, r.price_aed]));

  for (const k of missing) {
    const v1 = addonMap.get(k as never);
    if (typeof v1 === "number") {
      out.set(k, v1);
      continue;
    }
    const alt = ADDON_TYPE_FALLBACK[k];
    const v2 = alt ? addonMap.get(alt as never) : undefined;
    if (typeof v2 === "number") out.set(k, v2);
  }

  return out;
}

/** Single-key helper (e.g. park_slot, membership). */
export async function getPricingAmountByKey(key: string): Promise<number | null> {
  const { data, error } = await supabase.from("pricing").select("amount_aed").eq("key", key).maybeSingle();
  if (error) throw error;
  return typeof data?.amount_aed === "number" ? data.amount_aed : null;
}
