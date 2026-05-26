import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  formatPackageIncludes,
  type PackageCreditGrant,
  type PackageDefinition,
  type PackagePricing,
  pricingForPackageSize,
} from "@/lib/packageCatalog";

type PetSize = Database["public"]["Enums"]["pet_size"];

export type GroomingPackageCatalogRow = PackageDefinition & {
  includes: string;
  prices: Record<PetSize, Pick<PackagePricing, "id" | "amount_aed"> | null>;
};

export const groomingPackageQueryKeys = {
  catalog: ["package_definitions", "grooming", "catalog"] as const,
};

export function useGroomingPackageCatalog(enabled = true) {
  return useQuery({
    queryKey: groomingPackageQueryKeys.catalog,
    enabled,
    queryFn: async () => {
      const [{ data: defs, error: defsErr }, { data: pricing, error: pricingErr }, { data: grants, error: grantsErr }] =
        await Promise.all([
          supabase
            .from("package_definitions")
            .select("*")
            .eq("category", "grooming")
            .order("sort_order"),
          supabase.from("package_pricing").select("*").eq("is_active", true),
          supabase.from("package_credit_grants").select("*"),
        ]);
      if (defsErr) throw defsErr;
      if (pricingErr) throw pricingErr;
      if (grantsErr) throw grantsErr;

      const pricingRows = (pricing ?? []) as PackagePricing[];
      const grantRows = (grants ?? []) as PackageCreditGrant[];

      return ((defs ?? []) as PackageDefinition[]).map((def) => {
        const defGrants = grantRows.filter((grant) => grant.package_def_id === def.id);
        return {
          ...def,
          includes: formatPackageIncludes(defGrants),
          prices: {
            small: pricingForPackageSize(pricingRows, def.id, "small"),
            medium: pricingForPackageSize(pricingRows, def.id, "medium"),
            large: pricingForPackageSize(pricingRows, def.id, "large"),
          },
        } satisfies GroomingPackageCatalogRow;
      });
    },
  });
}

export function useUpdateGroomingPackagePrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { pricingId: string; amount_aed: number }) => {
      const { error } = await supabase
        .from("package_pricing")
        .update({ amount_aed: args.amount_aed, updated_at: new Date().toISOString() })
        .eq("id", args.pricingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groomingPackageQueryKeys.catalog });
      queryClient.invalidateQueries({ queryKey: ["package_pricing"] });
      queryClient.invalidateQueries({ queryKey: ["package_definitions"] });
    },
  });
}
