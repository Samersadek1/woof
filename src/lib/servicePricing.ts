type PriceByKey = Map<string, number>;

function amountFor(map: PriceByKey, key: string): number {
  return map.get(key) ?? 0;
}

export function buildPriceMap(rows: { key: string; amount_aed: number }[]): PriceByKey {
  return new Map(rows.map((r) => [r.key, r.amount_aed]));
}

export function daycareGroupPricing(
  dogCount: number,
  prices: PriceByKey,
): { pricingKey: string; total: number; label: string } {
  const n = Math.max(1, dogCount);
  const familyPerDog = amountFor(prices, "daycare_family_per_dog");
  const explicitKeyByCount: Record<number, string> = {
    1: "daycare_single_day",
    2: "daycare_2_dogs",
    3: "daycare_3_dogs",
    4: "daycare_4_dogs",
    5: "daycare_5_dogs",
    6: "daycare_6_dogs",
  };
  const explicitKey = explicitKeyByCount[n];
  if (explicitKey) {
    const explicitAmount = amountFor(prices, explicitKey);
    if (explicitAmount > 0) {
      return {
        pricingKey: explicitKey,
        total: explicitAmount,
        label: `Daycare single day — ${n} dog${n === 1 ? "" : "s"}`,
      };
    }
  }

  // Dynamic family pricing for 4+ dogs (no upper limit).
  if (n >= 4 && familyPerDog > 0) {
    return {
      pricingKey: "daycare_family_per_dog",
      total: n * familyPerDog,
      label: `Daycare family rate — ${n} dogs`,
    };
  }

  // Fallback keeps pricing monotonic if explicit higher-count keys are not configured.
  const base3 = amountFor(prices, "daycare_3_dogs");
  const single = amountFor(prices, "daycare_single_day");
  return {
    pricingKey: "daycare_3_dogs",
    total: base3 + (n - 3) * single,
    label: `Daycare single day — 3 dogs + ${n - 3} extra`,
  };
}

export function parkGroupPricing(
  dogCount: number,
  prices: PriceByKey,
): { pricingKey: string; total: number; label: string } {
  const n = Math.max(1, dogCount);
  if (n === 1) {
    return {
      pricingKey: "park_1_dog",
      total: amountFor(prices, "park_1_dog"),
      label: "Park visit — 1 dog",
    };
  }
  if (n === 2) {
    return {
      pricingKey: "park_2_dogs",
      total: amountFor(prices, "park_2_dogs"),
      label: "Park visit — 2 dogs",
    };
  }
  if (n === 3) {
    return {
      pricingKey: "park_3_dogs",
      total: amountFor(prices, "park_3_dogs"),
      label: "Park visit — 3 dogs",
    };
  }

  const base3 = amountFor(prices, "park_3_dogs");
  const extra = amountFor(prices, "park_extra_dog");
  return {
    pricingKey: "park_3_dogs",
    total: base3 + (n - 3) * extra,
    label: `Park visit — 3 dogs + ${n - 3} extra`,
  };
}
