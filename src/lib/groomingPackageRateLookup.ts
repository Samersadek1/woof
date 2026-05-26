import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";

export type GroomingPackage =
  | "grande"
  | "bijoux"
  | "deshedding_long"
  | "deshedding_smooth"
  | "bath_blow";

export type PetSize = "S" | "M" | "L" | "XL";

export type DeshedCoatTier = "long" | "smooth";

const SIZE_TO_PET_SIZE: Record<PetSize, Database["public"]["Enums"]["pet_size"]> = {
  S: "small",
  M: "medium",
  L: "large",
  XL: "large",
};

export function dogSizeFormToPackageSize(dogSize: DogSizeFormValue): PetSize {
  switch (dogSize) {
    case "Small":
      return "S";
    case "Medium":
      return "M";
    case "Large":
      return "L";
    case "Extra Large":
      return "XL";
  }
}

export function packageToServiceLookup(
  pkg: GroomingPackage,
  size: PetSize,
  coatType?: Database["public"]["Enums"]["coat_type"] | null,
): {
  service_code: Database["public"]["Enums"]["service_code"];
  pet_size: Database["public"]["Enums"]["pet_size"] | null;
  coat_type: Database["public"]["Enums"]["coat_type"] | null;
} {
  const petSize = SIZE_TO_PET_SIZE[size];
  switch (pkg) {
    case "grande":
      return { service_code: "grooming_full_service", pet_size: petSize, coat_type: null };
    case "bijoux":
      return { service_code: "grooming_bath_brush_tidy", pet_size: petSize, coat_type: null };
    case "deshedding_long":
      return { service_code: "grooming_hair_no_more", pet_size: null, coat_type: "long" };
    case "deshedding_smooth":
      return { service_code: "grooming_hair_no_more", pet_size: null, coat_type: "short" };
    case "bath_blow":
      return {
        service_code: "grooming_splash",
        pet_size: petSize,
        coat_type: splashCoatTypeFromPetCoat(coatType),
      };
  }
}

/** Splash rates are seeded for short/long only; map mid-length coats to long tier. */
export function splashCoatTypeFromPetCoat(
  coatType: Database["public"]["Enums"]["coat_type"] | null | undefined,
): Database["public"]["Enums"]["coat_type"] {
  if (coatType === "long" || coatType === "mid_length") return "long";
  return "short";
}

export function deshedCoatTypeFromPetCoat(
  coatType: Database["public"]["Enums"]["coat_type"] | null | undefined,
): Database["public"]["Enums"]["coat_type"] {
  if (coatType === "long") return "long";
  if (coatType === "mid_length") return "mid_length";
  return "short";
}

export async function resolveWoofServiceRateAmount(args: {
  service_code: Database["public"]["Enums"]["service_code"];
  pet_size?: Database["public"]["Enums"]["pet_size"] | null;
  coat_type?: Database["public"]["Enums"]["coat_type"] | null;
  booking_date?: string;
}): Promise<number | null> {
  const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
    p_service_code: args.service_code,
    p_pet_size: args.pet_size ?? undefined,
    p_coat_type: args.coat_type ?? undefined,
    p_booking_date: args.booking_date,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return typeof row?.amount_aed === "number" ? row.amount_aed : null;
}

export async function resolveGroomingPackageRateAmount(
  pkg: GroomingPackage,
  size: PetSize,
  bookingDate?: string,
  coatType?: Database["public"]["Enums"]["coat_type"] | null,
): Promise<number | null> {
  const lookup = packageToServiceLookup(pkg, size, coatType);
  return resolveWoofServiceRateAmount({
    service_code: lookup.service_code,
    pet_size: lookup.pet_size,
    coat_type: lookup.coat_type,
    booking_date: bookingDate,
  });
}
