import type { Database } from "@/integrations/supabase/types";
import { resolveAddonPricesForKeys } from "@/lib/addonPricing";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import {
  type DeshedCoatTier,
  type GroomingPackage,
  deshedCoatTypeFromPetCoat,
  dogSizeFormToPackageSize,
  resolveGroomingPackageRateAmount,
  resolveWoofServiceRateAmount,
} from "@/lib/groomingPackageRateLookup";
import type {
  GroomingPricingCheckbox,
  ManualGroomingAddonAed,
} from "@/lib/groomingNewAppointmentPricing";
import {
  isGroomingPricingCheckbox,
  resolvePrimaryGroomingCheckbox,
} from "@/lib/groomingNewAppointmentPricing";

export type GroomingManualFeeBounds = {
  mattingMin: number;
  mattingMax: number;
  heavyMin: number;
  heavyMax: number;
};

type PetCoatType = Database["public"]["Enums"]["coat_type"];

/** Boarding checkout keys resolved via `resolveAddonPricesForKeys` / service_rates. */
const WOOF_ADDON_LEGACY_KEYS: Partial<Record<GroomingPricingCheckbox, string>> = {
  nail_clip: "boarding_addon_nail_clipping",
  teeth_brushing: "boarding_addon_teeth_brushing",
  malaseb_bath: "boarding_addon_malaseb_bath",
  pawdicure: "boarding_addon_pawdicure",
  paw_wash: "boarding_addon_paw_wash",
};

const WOOF_ADDON_SERVICE_CODES: Partial<
  Record<GroomingPricingCheckbox, Database["public"]["Enums"]["service_code"]>
> = {
  matting_fee: "addon_dematting",
};

const ZERO_AED_CHECKBOXES = new Set<GroomingPricingCheckbox>([
  "fur_brushing",
  "ear_cleaning",
  "blow_dry",
]);

function primaryCheckboxToPackage(
  primary: GroomingPricingCheckbox,
  deshedCoat: DeshedCoatTier,
): GroomingPackage | null {
  switch (primary) {
    case "full_groom":
      return "grande";
    case "deshedding":
      return deshedCoat === "long" ? "deshedding_long" : "deshedding_smooth";
    case "bath_only":
    case "full_bath_full":
      return "bijoux";
    default:
      return null;
  }
}

function deseedTierFromPetCoat(petCoat: PetCoatType | null | undefined): DeshedCoatTier {
  return deshedCoatTypeFromPetCoat(petCoat) === "long" ? "long" : "smooth";
}

export async function fetchGroomingManualFeeBounds(): Promise<GroomingManualFeeBounds> {
  const dematting = (await resolveWoofServiceRateAmount({ service_code: "addon_dematting" })) ?? 0;
  const mattingMin = dematting > 0 ? dematting : 0;
  const mattingMax = mattingMin > 0 ? mattingMin * 2 : 0;
  return {
    mattingMin,
    mattingMax: mattingMax > mattingMin ? mattingMax : mattingMin,
    heavyMin: mattingMin > 0 ? Math.round(mattingMin * 0.75 * 100) / 100 : 0,
    heavyMax: mattingMax,
  };
}

export async function fetchCheckboxBasePriceAed(
  checkbox: GroomingPricingCheckbox,
  dogSize: DogSizeFormValue,
  petCoat?: PetCoatType | null,
  bookingDate?: string,
): Promise<number | null> {
  const packageSize = dogSizeFormToPackageSize(dogSize);
  const deshedCoat = deseedTierFromPetCoat(petCoat);

  if (checkbox === "deshedding") {
    return resolveWoofServiceRateAmount({
      service_code: "grooming_hair_no_more",
      coat_type: deshedCoatTypeFromPetCoat(petCoat),
      booking_date: bookingDate,
    });
  }

  const pkg = primaryCheckboxToPackage(checkbox, deshedCoat);
  if (!pkg) return null;
  return resolveGroomingPackageRateAmount(pkg, packageSize, bookingDate, petCoat);
}

export async function fetchNewGroomingAppointmentOriginalAed(
  selectedServices: readonly string[],
  dogSize: DogSizeFormValue | null,
  manualAddons?: ManualGroomingAddonAed | null,
  options?: { deseedCoat?: DeshedCoatTier; petCoat?: PetCoatType | null; bookingDate?: string },
): Promise<number | null> {
  const selected = selectedServices.filter(isGroomingPricingCheckbox);
  if (selected.length === 0) return null;
  if (dogSize == null) return null;

  const set = new Set(selected);
  const bathAndBlow = set.has("bath_only") && set.has("blow_dry");
  const deshedCoat = options?.deseedCoat ?? deseedTierFromPetCoat(options?.petCoat);
  const packageSize = dogSizeFormToPackageSize(dogSize);

  let base: number | null = null;
  if (bathAndBlow) {
    base = await resolveGroomingPackageRateAmount(
      "bath_blow",
      packageSize,
      options?.bookingDate,
      options?.petCoat,
    );
  } else if (set.has("deshedding")) {
    base = await resolveWoofServiceRateAmount({
      service_code: "grooming_hair_no_more",
      coat_type: deshedCoatTypeFromPetCoat(options?.petCoat),
      booking_date: options?.bookingDate,
    });
  } else {
    const primary = resolvePrimaryGroomingCheckbox(selected);
    const pkg = primary ? primaryCheckboxToPackage(primary, deshedCoat) : null;
    if (pkg) {
      base = await resolveGroomingPackageRateAmount(
        pkg,
        packageSize,
        options?.bookingDate,
        options?.petCoat,
      );
    } else {
      base = 0;
    }
  }

  if (base == null) return null;

  const legacyKeys: string[] = [];
  const serviceCodes: Database["public"]["Enums"]["service_code"][] = [];

  for (const key of selected) {
    if (bathAndBlow && key === "blow_dry") continue;
    if (key === "matting_fee" || key === "heavy_dog_fee") continue;
    if (ZERO_AED_CHECKBOXES.has(key)) continue;
    const legacy = WOOF_ADDON_LEGACY_KEYS[key];
    if (legacy) legacyKeys.push(legacy);
    const code = WOOF_ADDON_SERVICE_CODES[key];
    if (code) serviceCodes.push(code);
  }

  const [legacyPrices, serviceAmounts] = await Promise.all([
    resolveAddonPricesForKeys(legacyKeys),
    Promise.all(serviceCodes.map((code) => resolveWoofServiceRateAmount({ service_code: code }))),
  ]);

  let addonSum = 0;
  for (const k of legacyKeys) addonSum += legacyPrices.get(k) ?? 0;
  for (const amount of serviceAmounts) addonSum += amount ?? 0;

  if (set.has("matting_fee")) {
    const raw = manualAddons?.matting_fee;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      addonSum += raw;
    }
  }
  if (set.has("heavy_dog_fee")) {
    const raw = manualAddons?.heavy_dog_fee;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      addonSum += raw;
    }
  }

  return Number((base + addonSum).toFixed(3));
}
