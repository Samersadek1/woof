import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const dogBreedsQueryKey = ["dog_breeds"] as const;

export type DogBreedRow = { id: string; name: string; sort_order: number };

async function fetchDogBreeds(): Promise<DogBreedRow[]> {
  // TODO(phase-3): Restore when dog_breeds reference table exists in Woof schema.
  return [];
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
      throw new Error("Dog breeds list is not configured in Woof schema yet.");
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
      void id;
      throw new Error("Dog breeds list is not configured in Woof schema yet.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dogBreedsQueryKey });
    },
  });
}
