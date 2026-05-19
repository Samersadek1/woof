import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const dogBreedsQueryKey = ["dog_breeds"] as const;

export type DogBreedRow = { id: string; name: string; sort_order: number };

async function fetchDogBreeds(): Promise<DogBreedRow[]> {
  const { data, error } = await supabase
    .from("dog_breeds")
    .select("id,name,sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DogBreedRow[];
}

export function useDogBreedsQuery() {
  return useQuery({
    queryKey: dogBreedsQueryKey,
    queryFn: fetchDogBreeds,
  });
}

export function useAddDogBreed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { data: maxRows, error: maxErr } = await supabase
        .from("dog_breeds")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      if (maxErr) throw maxErr;
      const nextOrder = (maxRows?.[0]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("dog_breeds").insert({
        name: trimmed,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dogBreedsQueryKey });
    },
  });
}

export function useDeleteDogBreed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dog_breeds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dogBreedsQueryKey });
    },
  });
}
