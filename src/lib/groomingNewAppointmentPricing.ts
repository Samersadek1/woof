import type { GroomingService } from "@/lib/groomingCatalog";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";

/** Checkbox `value`s used on the New Appointment form (pricing + primary resolution). */
export type GroomingPricingCheckbox =
  | "full_groom"
  | "deshedding"
  | "bath_only"
  | "full_bath_full"
  | "fur_brushing"
  | "teeth_brushing"
  | "nail_clip"
  | "blow_dry"
  | "ear_cleaning"
  | "pawdicure"
  | "paw_wash"
  | "malaseb_bath"
  | "matting_fee"
  | "heavy_dog_fee";

const ALL_PRICING_CHECKBOXES: readonly GroomingPricingCheckbox[] = [
  "full_groom",
  "deshedding",
  "bath_only",
  "full_bath_full",
  "fur_brushing",
  "teeth_brushing",
  "nail_clip",
  "blow_dry",
  "ear_cleaning",
  "pawdicure",
  "paw_wash",
  "malaseb_bath",
  "matting_fee",
  "heavy_dog_fee",
] as const;

export const MATTING_FEE_AED_MIN = 63;
export const MATTING_FEE_AED_MAX = 126;
export const HEAVY_DOG_FEE_AED_MIN = 47;
export const HEAVY_DOG_FEE_AED_MAX = 126;

export type ManualGroomingAddonAed = {
  matting_fee?: number;
  heavy_dog_fee?: number;
};

export function clampMattingFeeAed(n: number): number {
  return Math.min(MATTING_FEE_AED_MAX, Math.max(MATTING_FEE_AED_MIN, n));
}

export function clampHeavyDogFeeAed(n: number): number {
  return Math.min(HEAVY_DOG_FEE_AED_MAX, Math.max(HEAVY_DOG_FEE_AED_MIN, n));
}

export function isGroomingPricingCheckbox(v: string): v is GroomingPricingCheckbox {
  return (ALL_PRICING_CHECKBOXES as readonly string[]).includes(v);
}

const BATH_AND_BLOW_DRY_BASE_AED = 158;

const PRICING_FULL_GROOM_OR_DESHED: Record<DogSizeFormValue, number> = {
  Small: 294,
  Medium: 336,
  Large: 378,
  "Extra Large": 399,
};

const PRICING_BATH_ONLY_BIJOU: Record<DogSizeFormValue, number> = {
  Small: 210,
  Medium: 242,
  Large: 294,
  "Extra Large": 336,
};

const PRICING_FULL_BATH: Record<DogSizeFormValue, number> = {
  Small: 210,
  Medium: 263,
  Large: 315,
  "Extra Large": 336,
};

const BASE_PRIORITY: GroomingPricingCheckbox[] = [
  "full_groom",
  "deshedding",
  "bath_only",
  "full_bath_full",
];

/** AED added on top of base (size-independent). */
const ADDON_AED: Partial<Record<GroomingPricingCheckbox, number>> = {
  pawdicure: 105,
  nail_clip: 47,
  teeth_brushing: 42,
  ear_cleaning: 0,
  malaseb_bath: 37,
  fur_brushing: 0,
  blow_dry: 0,
  paw_wash: 0,
};

/**
 * Primary package checkbox for DB `service` + base price tier.
 * Bath + Blow Dry combo: both `bath_only` and `blow_dry` → treat as fixed-rate package (primary `bath_only`).
 */
export function resolvePrimaryGroomingCheckbox(
  selected: readonly GroomingPricingCheckbox[],
): GroomingPricingCheckbox | null {
  const set = new Set(selected);
  if (set.has("bath_only") && set.has("blow_dry")) {
    return "bath_only";
  }
  for (const p of BASE_PRIORITY) {
    if (set.has(p)) return p;
  }
  return null;
}

export function groomingPricingCheckboxToDbService(cb: GroomingPricingCheckbox): GroomingService {
  switch (cb) {
    case "full_groom":
      return "full_groom";
    case "deshedding":
      return "deshedding";
    case "bath_only":
    case "full_bath_full":
    case "blow_dry":
    case "malaseb_bath":
      return "full_bath";
    case "fur_brushing":
    case "teeth_brushing":
    case "ear_cleaning":
      return "brushing";
    case "nail_clip":
      return "nail_clip";
    case "pawdicure":
    case "paw_wash":
      return "pawdicure";
    case "matting_fee":
    case "heavy_dog_fee":
      return "brushing";
    default:
      return "full_groom";
  }
}

/**
 * Original (pre-discount) AED for New Appointment from service + dog size + add-ons.
 * Returns `null` when dog size is required but not chosen, or when no priced base package is selected.
 */
export function computeNewGroomingAppointmentOriginalAed(
  selectedServices: readonly string[],
  dogSize: DogSizeFormValue | null,
  manualAddons?: ManualGroomingAddonAed | null,
): number | null {
  const selected = selectedServices.filter(isGroomingPricingCheckbox);
  if (selected.length === 0) return null;

  const set = new Set(selected);
  const bathAndBlow = set.has("bath_only") && set.has("blow_dry");

  let base: number | null = null;
  if (bathAndBlow) {
    base = BATH_AND_BLOW_DRY_BASE_AED;
  } else {
    const primary = resolvePrimaryGroomingCheckbox(selected);
    if (!primary) return null;
    if (dogSize == null) return null;
    if (primary === "full_groom" || primary === "deshedding") {
      base = PRICING_FULL_GROOM_OR_DESHED[dogSize];
    } else if (primary === "bath_only") {
      base = PRICING_BATH_ONLY_BIJOU[dogSize];
    } else if (primary === "full_bath_full") {
      base = PRICING_FULL_BATH[dogSize];
    }
  }

  if (base == null) return null;

  let addonSum = 0;
  for (const key of selected) {
    if (bathAndBlow && key === "blow_dry") continue;
    if (key === "matting_fee") {
      const raw = manualAddons?.matting_fee;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        addonSum += clampMattingFeeAed(raw);
      }
      continue;
    }
    if (key === "heavy_dog_fee") {
      const raw = manualAddons?.heavy_dog_fee;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        addonSum += clampHeavyDogFeeAed(raw);
      }
      continue;
    }
    const add = ADDON_AED[key];
    if (typeof add === "number") addonSum += add;
  }

  return Number((base + addonSum).toFixed(2));
}
