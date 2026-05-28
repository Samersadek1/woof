export type PriceByKey = Map<string, number>;

function amountFor(map: PriceByKey, key: string): number {
  return map.get(key) ?? 0;
}

export function buildPriceMap(rows: { key: string; amount_aed: number }[]): PriceByKey {
  return new Map(rows.map((r) => [r.key, r.amount_aed]));
}

/**
 * Billable daycare hours from actual duration (30-minute blocks):
 * - Each full hour counts as 1 hr.
 * - Leftover up to 30 min counts as 0.5 hr (first half hour).
 * - Leftover over 30 min counts as 1 hr (full hour, not another half).
 */
export function billableDaycareHourlyHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const totalMinutes = hours * 60;
  const fullHours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;
  if (remainderMinutes === 0) return fullHours;
  if (remainderMinutes <= 30) return fullHours + 0.5;
  return fullHours + 1;
}

/** @deprecated Use billableDaycareHourlyHours for daycare hourly billing. */
export function roundHoursToNearestHalfHour(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 2) / 2;
}

/** invoice_line_items.quantity is integer — store billable time as 30-minute slots. */
export function daycareHourlyHalfHourSlots(billableHours: number): number {
  if (!Number.isFinite(billableHours) || billableHours <= 0) return 0;
  return Math.round(billableHours * 2);
}

export function roundedHoursFromHalfHourSlots(slots: number): number {
  if (!Number.isFinite(slots) || slots <= 0) return 0;
  return slots / 2;
}

export function daycareHourlyHalfHourUnitRate(hourlyUnitRate: number): number {
  return hourlyUnitRate / 2;
}

/** Integer quantity + per-30-min unit price for hourly daycare invoice rows. */
export function daycareHourlyInvoiceLineUnits(
  billableHours: number,
  hourlyUnitRate: number,
): { roundedHours: number; quantity: number; unitPrice: number; lineTotal: number } {
  const roundedHours = billableDaycareHourlyHours(billableHours);
  const quantity = daycareHourlyHalfHourSlots(roundedHours);
  const unitPrice = daycareHourlyHalfHourUnitRate(hourlyUnitRate);
  return { roundedHours, quantity, unitPrice, lineTotal: quantity * unitPrice };
}

/** Per-dog hourly subtotal using 30-minute block billing rules. */
export function daycareHourlyPetSubtotal(
  hours: number,
  prices: PriceByKey,
): { roundedHours: number; unitRate: number; total: number; pricingKey: string } {
  const roundedHours = billableDaycareHourlyHours(hours);
  if (roundedHours <= 0) {
    return { roundedHours: 0, unitRate: 0, total: 0, pricingKey: DAYCARE_HOURLY_UNIT_KEY };
  }
  const unitRate = amountFor(prices, DAYCARE_HOURLY_UNIT_KEY);
  return {
    roundedHours,
    unitRate,
    total: unitRate * roundedHours,
    pricingKey: DAYCARE_HOURLY_UNIT_KEY,
  };
}

/** Keys used by the Live Rate Card (matches `pricing.key`). */
export const DAYCARE_HOURLY_PRICING_KEYS = [
  "daycare_hourly_single_day",
  "daycare_hourly_2_dogs",
  "daycare_hourly_3_dogs",
  "daycare_hourly_family_per_dog",
  "daycare_hourly_4_dogs",
  "daycare_hourly_5_dogs",
  "daycare_hourly_6_dogs",
] as const;

/** Single hourly unit rate from the Live Rate Card (AED per dog per hour). */
export const DAYCARE_HOURLY_UNIT_KEY = "daycare_hourly_single_day" as const;

function formatHourCount(hours: number): string {
  const label = Number.isInteger(hours)
    ? String(hours)
    : hours.toLocaleString("en-AE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
  return `${label} hr`;
}

/**
 * Linear daycare hourly total: unit rate × dogs × hours.
 * Uses `daycare_hourly_single_day` as the per-dog hourly rate from `pricing`.
 * Billable hours use 30-minute block rules before totals.
 */
export function daycareHourlyLinearTotal(
  dogCount: number,
  hours: number,
  prices: PriceByKey,
): { pricingKey: string; unitRate: number; total: number; label: string; dogHours: number; roundedHours: number } {
  if (dogCount <= 0 || hours <= 0) {
    return { pricingKey: DAYCARE_HOURLY_UNIT_KEY, unitRate: 0, total: 0, label: "", dogHours: 0, roundedHours: 0 };
  }
  const unitRate = amountFor(prices, DAYCARE_HOURLY_UNIT_KEY);
  const roundedHours = billableDaycareHourlyHours(hours);
  const dogHours = dogCount * roundedHours;
  const total = unitRate * dogHours;
  return {
    pricingKey: DAYCARE_HOURLY_UNIT_KEY,
    unitRate,
    total,
    dogHours,
    roundedHours,
    label: `Daycare hourly (${dogCount} dog${dogCount === 1 ? "" : "s"} × ${formatHourCount(roundedHours)})`,
  };
}

export function daycareHourlyGroupPricing(
  dogCount: number,
  prices: PriceByKey,
): { pricingKey: string; total: number; label: string } {
  if (dogCount <= 0) {
    return { pricingKey: "", total: 0, label: "" };
  }
  const n = dogCount;
  const familyPerDog = amountFor(prices, "daycare_hourly_family_per_dog");
  const explicitKeyByCount: Record<number, string> = {
    1: "daycare_hourly_single_day",
    2: "daycare_hourly_2_dogs",
    3: "daycare_hourly_3_dogs",
    4: "daycare_hourly_4_dogs",
    5: "daycare_hourly_5_dogs",
    6: "daycare_hourly_6_dogs",
  };
  const explicitKey = explicitKeyByCount[n];
  if (explicitKey) {
    const explicitAmount = amountFor(prices, explicitKey);
    if (explicitAmount > 0) {
      return {
        pricingKey: explicitKey,
        total: explicitAmount,
        label: `Daycare hourly — ${n} dog${n === 1 ? "" : "s"}`,
      };
    }
  }

  if (n >= 4 && familyPerDog > 0) {
    return {
      pricingKey: "daycare_hourly_family_per_dog",
      total: n * familyPerDog,
      label: `Daycare hourly family rate — ${n} dogs`,
    };
  }

  const base3 = amountFor(prices, "daycare_hourly_3_dogs");
  const single = amountFor(prices, "daycare_hourly_single_day");
  return {
    pricingKey: "daycare_hourly_3_dogs",
    total: base3 + (n - 3) * single,
    label: `Daycare hourly — 3 dogs + ${n - 3} extra`,
  };
}

export function daycareGroupPricing(
  dogCount: number,
  prices: PriceByKey,
): { pricingKey: string; total: number; label: string } {
  if (dogCount <= 0) {
    return { pricingKey: "", total: 0, label: "" };
  }
  const n = dogCount;
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
