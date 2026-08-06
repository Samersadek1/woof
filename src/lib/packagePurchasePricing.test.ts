import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  hasUnresolvedPackagePricing,
  isMissingCoatTypePricingMatch,
  resolvePetPackageAmount,
} from "@/lib/packagePurchasePricing";

type Pet = Pick<
  Database["public"]["Tables"]["pets"]["Row"],
  "id" | "name" | "size" | "coat_type" | "species" | "active"
>;
type PackagePricing = Database["public"]["Tables"]["package_pricing"]["Row"];

function pricing(partial: Partial<PackagePricing> & Pick<PackagePricing, "amount_aed">): PackagePricing {
  return {
    id: partial.id ?? crypto.randomUUID(),
    package_def_id: partial.package_def_id ?? "pkg-1",
    pet_size: partial.pet_size ?? "medium",
    coat_type: partial.coat_type ?? null,
    amount_aed: partial.amount_aed,
    is_active: partial.is_active ?? true,
    effective_from: partial.effective_from ?? null,
    effective_to: partial.effective_to ?? null,
    updated_at: partial.updated_at ?? new Date().toISOString(),
  };
}

function pet(partial: Partial<Pet> & Pick<Pet, "name">): Pet {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name,
    size: partial.size ?? "medium",
    coat_type: partial.coat_type ?? null,
    species: partial.species ?? "dog",
    active: partial.active ?? true,
  };
}

/** Summer Splash–style rates: size + coat required (short / long variants). */
const splashStyleRates: PackagePricing[] = [
  pricing({ pet_size: "medium", coat_type: "short", amount_aed: 420 }),
  pricing({ pet_size: "medium", coat_type: "long", amount_aed: 480 }),
  pricing({ pet_size: "large", coat_type: "short", amount_aed: 520 }),
  pricing({ pet_size: "large", coat_type: "long", amount_aed: 580 }),
];

describe("resolvePetPackageAmount", () => {
  it("returns matched amount when coat_type is set (normal case)", () => {
    const shortPet = pet({ name: "Luna", coat_type: "short" });
    expect(resolvePetPackageAmount(splashStyleRates, shortPet)).toBe(420);

    const longPet = pet({ name: "Rocky", coat_type: "long" });
    expect(resolvePetPackageAmount(splashStyleRates, longPet)).toBe(480);
  });

  it("returns null when coat_type is unset for coat-dependent package", () => {
    const unsetPet = pet({ name: "Mochi", coat_type: null });
    expect(resolvePetPackageAmount(splashStyleRates, unsetPet)).toBeNull();
  });

  it("still matches coat-agnostic packages at AED 0 without coat_type", () => {
    const freeAddonRates = [pricing({ pet_size: "medium", coat_type: null, amount_aed: 0 })];
    const unsetPet = pet({ name: "Freebie", coat_type: null });
    expect(resolvePetPackageAmount(freeAddonRates, unsetPet)).toBe(0);
  });
});

describe("isMissingCoatTypePricingMatch", () => {
  it("is true only when amount is unresolved because coat_type is unset", () => {
    const unsetPet = pet({ name: "Mochi", coat_type: null });
    const amount = resolvePetPackageAmount(splashStyleRates, unsetPet);
    expect(amount).toBeNull();
    expect(isMissingCoatTypePricingMatch(splashStyleRates, unsetPet, amount)).toBe(true);
  });

  it("is false when coat_type is set and price matches", () => {
    const shortPet = pet({ name: "Luna", coat_type: "short" });
    const amount = resolvePetPackageAmount(splashStyleRates, shortPet);
    expect(amount).toBe(420);
    expect(isMissingCoatTypePricingMatch(splashStyleRates, shortPet, amount)).toBe(false);
  });

  it("is false for legitimate AED 0 when coat is not required", () => {
    const freeAddonRates = [pricing({ pet_size: "medium", coat_type: null, amount_aed: 0 })];
    const unsetPet = pet({ name: "Freebie", coat_type: null });
    const amount = resolvePetPackageAmount(freeAddonRates, unsetPet);
    expect(amount).toBe(0);
    expect(isMissingCoatTypePricingMatch(freeAddonRates, unsetPet, amount)).toBe(false);
  });
});

describe("hasUnresolvedPackagePricing", () => {
  it("blocks when any selected pet has a null amount (missing match)", () => {
    expect(hasUnresolvedPackagePricing([{ amount: 420 }, { amount: null }])).toBe(true);
  });

  it("does not block legitimate AED 0 prices", () => {
    expect(hasUnresolvedPackagePricing([{ amount: 0 }, { amount: 120 }])).toBe(false);
  });
});
