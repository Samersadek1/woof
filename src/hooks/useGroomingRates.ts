import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type GroomingPackage =
  | "grande"
  | "bijoux"
  | "deshedding_long"
  | "deshedding_smooth"
  | "bath_blow";
export type PetSize = "S" | "M" | "L" | "XL";

export interface GroomingRate {
  id: string;
  package: GroomingPackage;
  size: PetSize;
  amount_aed: number;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

const SIZE_TO_PET_SIZE: Record<PetSize, Database["public"]["Enums"]["pet_size"]> = {
  S: "small",
  M: "medium",
  L: "large",
  XL: "large",
};

function packageToLookup(
  pkg: GroomingPackage,
  size: PetSize,
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
      return { service_code: "grooming_splash", pet_size: petSize, coat_type: "short" };
  }
}

export function useGroomingRates() {
  return useQuery({
    queryKey: ["grooming-rates"],
    queryFn: async () => {
      const rows: GroomingRate[] = [];
      for (const pkg of ["grande", "bijoux", "deshedding_long", "deshedding_smooth", "bath_blow"] as GroomingPackage[]) {
        for (const size of ["S", "M", "L", "XL"] as PetSize[]) {
          const lookup = packageToLookup(pkg, size);
          const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
            p_service_code: lookup.service_code,
            p_pet_size: lookup.pet_size,
            p_coat_type: lookup.coat_type,
          });
          if (error) throw error;
          const row = (data ?? [])[0];
          rows.push({
            id: `${pkg}:${size}`,
            package: pkg,
            size,
            amount_aed: typeof row?.amount_aed === "number" ? row.amount_aed : 0,
            notes: row?.notes ?? null,
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
      const lookup = packageToLookup(args.package, args.size);
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
