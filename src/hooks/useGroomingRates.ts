import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export function useGroomingRates() {
  return useQuery({
    queryKey: ["grooming-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_package_rates")
        .select("*")
        .order("package")
        .order("size");
      if (error) throw error;
      return (data ?? []) as GroomingRate[];
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
      const { error } = await supabase.from("grooming_package_rates").upsert(
        {
          package: args.package,
          size: args.size,
          amount_aed: args.amount_aed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "package,size" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["grooming-rates"],
      }),
  });
}
