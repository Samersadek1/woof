import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type GroomingPackage,
  type PetSize,
  packageToServiceLookup,
  resolveWoofServiceRateAmount,
} from "@/lib/groomingPackageRateLookup";

export type { GroomingPackage, PetSize } from "@/lib/groomingPackageRateLookup";

export interface GroomingRate {
  id: string;
  package: GroomingPackage;
  size: PetSize;
  amount_aed: number;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

const PACKAGES: GroomingPackage[] = [
  "grande",
  "bijoux",
  "deshedding_long",
  "deshedding_smooth",
  "bath_blow",
];
const SIZES: PetSize[] = ["S", "M", "L", "XL"];

export function useGroomingRates() {
  return useQuery({
    queryKey: ["grooming-rates"],
    queryFn: async () => {
      const rows: GroomingRate[] = [];
      for (const pkg of PACKAGES) {
        for (const size of SIZES) {
          const lookup = packageToServiceLookup(pkg, size);
          const amount_aed = (await resolveWoofServiceRateAmount({
            service_code: lookup.service_code,
            pet_size: lookup.pet_size,
            coat_type: lookup.coat_type,
          })) ?? 0;
          rows.push({
            id: `${pkg}:${size}`,
            package: pkg,
            size,
            amount_aed,
            notes: null,
            updated_at: new Date().toISOString(),
            updated_by: null,
          });
        }
      }
      return rows;
    },
  });
}

export function useUpdateGroomingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      package: GroomingPackage;
      size: PetSize;
      amount_aed: number;
    }) => {
      const lookup = packageToServiceLookup(args.package, args.size);
      let selectQuery = supabase
        .from("service_rates")
        .select("id")
        .eq("service_code", lookup.service_code)
        .is("season", null)
        .eq("is_active", true)
        .limit(1);
      selectQuery =
        lookup.pet_size == null
          ? selectQuery.is("pet_size", null)
          : selectQuery.eq("pet_size", lookup.pet_size);
      selectQuery =
        lookup.coat_type == null
          ? selectQuery.is("coat_type", null)
          : selectQuery.eq("coat_type", lookup.coat_type);
      const { data: existingRows, error: selectError } = await selectQuery;
      if (selectError) throw selectError;
      const existing = existingRows?.[0];

      const payload = {
        service_code: lookup.service_code,
        pet_size: lookup.pet_size,
        coat_type: lookup.coat_type,
        season: null,
        amount_aed: args.amount_aed,
        updated_at: new Date().toISOString(),
      };
      const { error } = existing
        ? await supabase.from("service_rates").update(payload).eq("id", existing.id)
        : await supabase.from("service_rates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["grooming-rates"],
      }),
  });
}
