import type { Database } from "@/integrations/supabase/types";

type ServiceCode = Database["public"]["Enums"]["service_code"];
type PetSize = Database["public"]["Enums"]["pet_size"];

export type PackageDefinition = Database["public"]["Tables"]["package_definitions"]["Row"];
export type PackagePricing = Database["public"]["Tables"]["package_pricing"]["Row"];
export type PackageCreditGrant = Database["public"]["Tables"]["package_credit_grants"]["Row"];

export const PET_SIZE_COLUMNS: { size: PetSize; label: string }[] = [
  { size: "small", label: "Small" },
  { size: "medium", label: "Medium" },
  { size: "large", label: "Large" },
];

/** Credits issued by sold multi-session packages (daycare, grooming, treadmill). */
export const SOLD_PACKAGE_CREDIT_CODES: ServiceCode[] = [
  "daycare_full_day",
  "daycare_hourly",
  "grooming_splash",
  "grooming_full_service",
  "treadmill_daycare_addon",
];

const SERVICE_GRANT_LABELS: Partial<Record<ServiceCode, string>> = {
  daycare_full_day: "Full Daycare Day",
  daycare_hourly: "Daycare Hour",
  grooming_splash: "Splash",
  grooming_full_service: "Full Service",
  treadmill_daycare_addon: "Treadmill Session",
};

export function serviceGrantLabel(serviceCode: ServiceCode): string {
  return SERVICE_GRANT_LABELS[serviceCode] ?? serviceCode.replaceAll("_", " ");
}

export function formatCreditGrant(grant: Pick<PackageCreditGrant, "service_code" | "units" | "is_bonus">): string {
  const label = serviceGrantLabel(grant.service_code);
  const sessions = `${grant.units} ${label} session${grant.units === 1 ? "" : "s"}`;
  return grant.is_bonus ? `+ ${sessions} (bonus)` : sessions;
}

export function formatPackageIncludes(grants: PackageCreditGrant[]): string {
  const sorted = [...grants].sort((a, b) => a.sort_order - b.sort_order || Number(a.is_bonus) - Number(b.is_bonus));
  return sorted.map(formatCreditGrant).join(" · ");
}

export function pricingForPackageSize(
  pricing: PackagePricing[],
  packageDefId: string,
  size: PetSize,
): PackagePricing | null {
  return (
    pricing.find(
      (row) =>
        row.package_def_id === packageDefId &&
        row.is_active &&
        row.pet_size === size &&
        row.coat_type == null,
    ) ?? null
  );
}
