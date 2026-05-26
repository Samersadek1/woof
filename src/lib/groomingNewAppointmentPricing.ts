import type { GroomingService } from "@/lib/groomingCatalog";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import type { GroomingManualFeeBounds } from "@/lib/groomingNewAppointmentRates";

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

export type ManualGroomingAddonAed = {
  matting_fee?: number;
  heavy_dog_fee?: number;
};

export function clampMattingFeeAed(
  n: number,
  bounds?: Pick<GroomingManualFeeBounds, "mattingMin" | "mattingMax">,
): number {
  const min = bounds?.mattingMin ?? 0;
  const max = bounds?.mattingMax ?? min;
  if (max <= min) return Math.max(0, n);
  return Math.min(max, Math.max(min, n));
}

export function clampHeavyDogFeeAed(
  n: number,
  bounds?: Pick<GroomingManualFeeBounds, "heavyMin" | "heavyMax">,
): number {
  const min = bounds?.heavyMin ?? 0;
  const max = bounds?.heavyMax ?? min;
  if (max <= min) return Math.max(0, n);
  return Math.min(max, Math.max(min, n));
}

export function isGroomingPricingCheckbox(v: string): v is GroomingPricingCheckbox {
  return (ALL_PRICING_CHECKBOXES as readonly string[]).includes(v);
}

const BASE_PRIORITY: GroomingPricingCheckbox[] = [
  "full_groom",
  "deshedding",
  "bath_only",
  "full_bath_full",
];

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

export {
  fetchGroomingManualFeeBounds,
  fetchNewGroomingAppointmentOriginalAed,
} from "@/lib/groomingNewAppointmentRates";

/** @deprecated Use `fetchNewGroomingAppointmentOriginalAed` (loads live rates). */
export function computeNewGroomingAppointmentOriginalAed(
  _selectedServices: readonly string[],
  _dogSize: DogSizeFormValue | null,
  _manualAddons?: ManualGroomingAddonAed | null,
): number | null {
  return null;
}
