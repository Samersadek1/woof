/**
 * Transport pricing helpers (April 2026 rate card).
 *
 * The DB `pricing` table holds three keys:
 *   - `transport_dubai_shared`  — AED 44.38 per dog per one-way trip
 *   - `transport_dubai`         — AED 125.00 flat per one-way trip (up to 3 family dogs, private taxi)
 *   - `transport_abudhabi`      — AED 250.00 per dog per one-way trip
 *
 * We call the union of these "TransportZone". The legacy DB column
 * `bookings.transport_zone` / `daycare_packages.transport_zone` stores a
 * free-text string — older rows contain the value `"dubai"` which we treat as
 * `"dubai_private"` (since `transport_dubai` is the private key).
 */

export type TransportZone = "dubai_shared" | "dubai_private" | "abudhabi";

export const TRANSPORT_ZONES: TransportZone[] = [
  "dubai_shared",
  "dubai_private",
  "abudhabi",
];

export const TRANSPORT_ZONE_OPTIONS: {
  value: TransportZone;
  label: string;
  helper: string;
}[] = [
  {
    value: "dubai_shared",
    label: "Dubai — Shared taxi",
    helper: "Per dog, one-way",
  },
  {
    value: "dubai_private",
    label: "Dubai — Private taxi",
    helper: "Flat per trip, up to 3 family dogs",
  },
  {
    value: "abudhabi",
    label: "Other Emirates",
    helper: "Per dog, one-way",
  },
];

/**
 * Resolves a TransportZone to the canonical `pricing.key` value.
 */
export function transportPricingKey(zone: TransportZone): string {
  switch (zone) {
    case "dubai_shared":
      return "transport_dubai_shared";
    case "dubai_private":
      return "transport_dubai";
    case "abudhabi":
      return "transport_abudhabi";
  }
}

/**
 * Short label for invoices / receipts.
 */
export function transportZoneLabel(zone: TransportZone): string {
  switch (zone) {
    case "dubai_shared":
      return "Dubai (shared)";
    case "dubai_private":
      return "Dubai (private)";
    case "abudhabi":
      return "Other Emirates";
  }
}

/**
 * How many units to bill for a single trip given the selected zone and the
 * number of dogs going along:
 *   - shared / abudhabi → per-dog charge (quantity = dog count)
 *   - private           → flat per trip (quantity = 1, cap 3 dogs)
 */
export function transportQuantityForPets(zone: TransportZone, petCount: number): number {
  const pets = Math.max(1, petCount);
  if (zone === "dubai_private") return 1;
  return pets;
}

/**
 * Returns true when a private Dubai trip would exceed the 3-dog cap.
 * Callers can surface a warning and/or auto-split into extra shared legs.
 */
export function privateDubaiOverCapacity(zone: TransportZone, petCount: number): boolean {
  return zone === "dubai_private" && petCount > 3;
}

/**
 * Converts stored (legacy) zone strings into the current TransportZone union.
 * Old rows frequently contain the plain value `"dubai"` — that mapped to the
 * old single-rate `transport_dubai` key which is now the private rate.
 */
export function normalizeStoredTransportZone(
  value: string | null | undefined,
): TransportZone | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "dubai_shared" || v === "dubai-shared" || v === "shared") return "dubai_shared";
  if (v === "dubai_private" || v === "dubai-private" || v === "private" || v === "dubai") return "dubai_private";
  if (v === "abudhabi" || v === "abu_dhabi" || v === "abu-dhabi" || v === "auh") return "abudhabi";
  return null;
}

export const TRANSPORT_PRICING_KEYS: readonly string[] = [
  "transport_dubai_shared",
  "transport_dubai",
  "transport_abudhabi",
];

/** Long-stay complimentary transport when pickup/drop-off is selected (boarding new booking). */
export type BoardingTransportFreePromo =
  | { applies: false }
  | { applies: true; notice: string };

const DUBAI_ZONES: TransportZone[] = ["dubai_shared", "dubai_private"];

/**
 * Dubai (shared or private): free pickup/drop-off when stay is 5+ nights.
 * Abu Dhabi (`abudhabi` zone): free when stay is 10+ nights.
 */
export function boardingTransportFreePromo(
  nights: number,
  zone: TransportZone,
): BoardingTransportFreePromo {
  const n = Number.isFinite(nights) && nights > 0 ? nights : 0;
  if (n < 1) return { applies: false };

  if (DUBAI_ZONES.includes(zone) && n >= 5) {
    return {
      applies: true,
      notice: "🎉 Free transport included for stays of 5+ nights in Dubai",
    };
  }
  if (zone === "abudhabi" && n >= 10) {
    return {
      applies: true,
      notice: "🎉 Free transport included for stays of 10+ nights in Abu Dhabi",
    };
  }
  return { applies: false };
}
