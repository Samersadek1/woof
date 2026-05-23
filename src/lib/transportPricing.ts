/**
 * Transport pricing helpers (April 2026 rate card).
 *
 * The DB `pricing` table holds three keys:
 *   - `transport_dubai_shared`  — AED 44.38 per dog per one-way trip
 *   - `transport_dubai`         — AED 125.00 flat per one-way trip (up to 3 family dogs, private taxi)
 *   - `transport_abudhabi`      — AED 250.00 per dog per one-way trip
 *
 * We call the union of these "TransportZone". The legacy DB column
 * `bookings.transport_zone` stores a
 * free-text string — older rows contain the value `"dubai"` which we treat as
 * `"dubai_private"` (since `transport_dubai` is the private key).
 */

export type TransportZone =
  | "dubai_shared"
  | "dubai_private"
  | "abudhabi"
  | "sharjah"
  | "ajman"
  | "umm_al_quwain"
  | "ras_al_khaimah"
  | "fujairah"
  /** Staff-selected complimentary transport: no pricing key, zero charges. */
  | "complimentary"
  /** Free transport — AED 0, explicitly priced at zero. */
  | "free";

export const TRANSPORT_ZONES: TransportZone[] = [
  "dubai_shared",
  "dubai_private",
  "abudhabi",
  "sharjah",
  "ajman",
  "umm_al_quwain",
  "ras_al_khaimah",
  "fujairah",
  "complimentary",
  "free",
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
    label: "Abu Dhabi",
    helper: "Per dog, one-way",
  },
  {
    value: "sharjah",
    label: "Sharjah",
    helper: "Per dog, one-way",
  },
  {
    value: "ajman",
    label: "Ajman",
    helper: "Per dog, one-way",
  },
  {
    value: "umm_al_quwain",
    label: "Umm Al Quwain",
    helper: "Per dog, one-way",
  },
  {
    value: "ras_al_khaimah",
    label: "Ras Al Khaimah",
    helper: "Per dog, one-way",
  },
  {
    value: "fujairah",
    label: "Fujairah",
    helper: "Per dog, one-way",
  },
  {
    value: "complimentary",
    label: "Complimentary",
    helper: "No charge — not billed",
  },
  {
    value: "free",
    label: "Free — AED 0",
    helper: "No transport charge",
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
    case "sharjah":
    case "ajman":
    case "umm_al_quwain":
    case "ras_al_khaimah":
    case "fujairah":
      return "transport_abudhabi";
    case "complimentary":
      return "transport_complimentary";
    case "free":
      return "transport_free";
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
      return "Abu Dhabi";
    case "sharjah":
      return "Sharjah";
    case "ajman":
      return "Ajman";
    case "umm_al_quwain":
      return "Umm Al Quwain";
    case "ras_al_khaimah":
      return "Ras Al Khaimah";
    case "fujairah":
      return "Fujairah";
    case "complimentary":
      return "Complimentary";
    case "free":
      return "Free";
  }
}

/**
 * How many units to bill for a single trip given the selected zone and the
 * number of dogs going along:
 *   - shared / abudhabi → per-dog charge (quantity = dog count)
 *   - private           → flat per trip (quantity = 1, cap 3 dogs)
 */
export function transportQuantityForPets(zone: TransportZone, petCount: number): number {
  void zone;
  void petCount;
  // Woof Phase 2 transport pricing is intentionally zeroed (UI flags remain).
  return 0;
}

/**
 * Returns true when a private Dubai trip would exceed the 3-dog cap.
 * Callers can surface a warning and/or auto-split into extra shared legs.
 */
export function privateDubaiOverCapacity(zone: TransportZone, petCount: number): boolean {
  if (zone === "complimentary" || zone === "free") return false;
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
  if (v === "abudhabi" || v === "abu_dhabi" || v === "abu-dhabi" || v === "auh" || v === "abu dhabi") return "abudhabi";
  if (v === "sharjah") return "sharjah";
  if (v === "ajman") return "ajman";
  if (v === "umm_al_quwain" || v === "umm al quwain" || v === "uaq") return "umm_al_quwain";
  if (v === "ras_al_khaimah" || v === "ras al khaimah" || v === "rak") return "ras_al_khaimah";
  if (v === "fujairah") return "fujairah";
  if (v === "complimentary" || v === "no_charge") return "complimentary";
  if (v === "free") return "free";
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

/** Simplified region picker in Boarding New Booking (maps to pricing keys). */
export type BoardingTransportRegion = "dubai" | "abudhabi" | "other";

export const BOARDING_TRANSPORT_REGION_OPTIONS: {
  value: BoardingTransportRegion;
  label: string;
}[] = [
  { value: "dubai", label: "Dubai" },
  { value: "abudhabi", label: "Abu Dhabi" },
  { value: "other", label: "Other" },
];

/**
 * Maps UI region to internal transport zone / pricing key.
 * Other → same rate card as Abu Dhabi / Other Emirates; staff can override AED per leg.
 */
export function regionToTransportZone(region: BoardingTransportRegion): TransportZone {
  switch (region) {
    case "dubai":
      return "dubai_shared";
    case "abudhabi":
      return "abudhabi";
    case "other":
      return "abudhabi";
  }
}

/** Parses AED amounts from boarding transport price inputs (comma-safe). */
export function parseBoardingTransportAed(value: string): number {
  void value;
  // Woof Phase 2 transport pricing is intentionally zeroed (UI flags remain).
  return 0;
}

export function transportRegionLabel(region: BoardingTransportRegion): string {
  switch (region) {
    case "dubai":
      return "Dubai";
    case "abudhabi":
      return "Abu Dhabi";
    case "other":
      return "Other";
  }
}

/**
 * Dubai: free transport when stay is 5+ nights.
 * Abu Dhabi: free when stay is 10+ nights.
 * Other: no automatic free rule.
 */
export function boardingTransportFreePromoFromRegion(
  nights: number,
  region: BoardingTransportRegion,
): BoardingTransportFreePromo {
  const n = Number.isFinite(nights) && nights > 0 ? nights : 0;
  if (n < 1) return { applies: false };

  if (region === "dubai" && n >= 5) {
    return { applies: true, notice: "🎉 Free transport" };
  }
  if (region === "abudhabi" && n >= 10) {
    return {
      applies: true,
      notice: "🎉 Free transport included for stays of 10+ nights in Abu Dhabi",
    };
  }
  return { applies: false };
}

const DUBAI_ZONES: TransportZone[] = ["dubai_shared", "dubai_private"];

/**
 * @deprecated Prefer boardingTransportFreePromoFromRegion + BoardingTransportRegion in new booking UI.
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
      notice: "🎉 Free transport",
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
