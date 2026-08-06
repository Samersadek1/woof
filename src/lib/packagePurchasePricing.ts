import type { Database } from "@/integrations/supabase/types";

type Pet = Pick<
  Database["public"]["Tables"]["pets"]["Row"],
  "id" | "name" | "size" | "coat_type" | "species" | "active"
>;
type PackagePricing = Database["public"]["Tables"]["package_pricing"]["Row"];

/** Resolve catalog package price for a pet from package_pricing rows. */
export function resolvePetPackageAmount(rows: PackagePricing[], pet: Pet): number | null {
  const candidates = rows
    .filter((r) => r.is_active)
    .filter((r) => r.pet_size === null || r.pet_size === pet.size)
    .filter((r) => r.coat_type === null || r.coat_type === pet.coat_type)
    .sort((a, b) => {
      const aScore = Number(a.pet_size !== null) + Number(a.coat_type !== null);
      const bScore = Number(b.pet_size !== null) + Number(b.coat_type !== null);
      return bScore - aScore;
    });
  return candidates[0]?.amount_aed ?? null;
}

/**
 * True when amount is unresolved specifically because the pet has no coat_type
 * and the package's size-eligible rates require a coat tier.
 */
export function isMissingCoatTypePricingMatch(
  rows: PackagePricing[],
  pet: Pet,
  amount: number | null,
): boolean {
  if (amount != null || pet.coat_type != null) return false;
  const sizeEligible = rows.filter(
    (r) => r.is_active && (r.pet_size === null || r.pet_size === pet.size),
  );
  if (sizeEligible.length === 0) return false;
  const hasCoatSpecific = sizeEligible.some((r) => r.coat_type !== null);
  const hasCoatAgnostic = sizeEligible.some((r) => r.coat_type === null);
  return hasCoatSpecific && !hasCoatAgnostic;
}

/** Unresolved catalog price (null) — not a legitimate AED 0.00 rate. */
export function hasUnresolvedPackagePricing(
  perPetPreview: Array<{ amount: number | null }>,
): boolean {
  return perPetPreview.some((row) => row.amount == null);
}
