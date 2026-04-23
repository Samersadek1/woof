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
  if (n === 1) {
    return {
      pricingKey: "daycare_single_day",
      total: amountFor(prices, "daycare_single_day"),
      label: "Daycare single day — 1 dog",
    };
  }
  if (n === 2) {
    return {
      pricingKey: "daycare_2_dogs",
      total: amountFor(prices, "daycare_2_dogs"),
      label: "Daycare single day — 2 dogs",
    };
  }
  if (n === 3) {
    return {
      pricingKey: "daycare_3_dogs",
      total: amountFor(prices, "daycare_3_dogs"),
      label: "Daycare single day — 3 dogs",
    };
  }

  // No explicit "extra dog" key exists for daycare yet; keep pricing monotonic.
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
