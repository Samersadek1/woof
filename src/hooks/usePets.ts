import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Pet = Database["public"]["Tables"]["pets"]["Row"];
type PetInsert = Database["public"]["Tables"]["pets"]["Insert"];
type PetUpdate = Database["public"]["Tables"]["pets"]["Update"];
type Vaccination = Database["public"]["Tables"]["vaccinations"]["Row"];

export type PetWithVaccinations = Pet & { vaccinations: Vaccination[] };

export const petQueryKeys = {
  pets: (ownerId: string) => ["pets", ownerId] as const,
  pet: (id: string) => ["pets", "detail", id] as const,
};

export function usePets(ownerId: string) {
  return useQuery({
    queryKey: petQueryKeys.pets(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("*, vaccinations(*)")
        .eq("owner_id", ownerId);

      if (error) throw error;
      return data as PetWithVaccinations[];
    },
  });
}

export function usePet(id: string) {
  return useQuery({
    queryKey: petQueryKeys.pet(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("*, vaccinations(*)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as PetWithVaccinations;
    },
  });
}

export function useCreatePet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pet: PetInsert) => {
      const { data, error } = await supabase
        .from("pets")
        .insert(pet)
        .select()
        .single();

      if (error) throw error;
      return data as Pet;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pets(data.owner_id) });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}

export function useUpdatePet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PetUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("pets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Pet;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pets(data.owner_id) });
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pet(data.id) });
    },
  });
}

export type VaccinationInsert = Database["public"]["Tables"]["vaccinations"]["Insert"];

export function useAddVaccination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vaccination: VaccinationInsert) => {
      const { data, error } = await supabase
        .from("vaccinations")
        .insert(vaccination)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pet(data.pet_id) });
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useDeleteVaccination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, petId }: { id: string; petId: string }) => {
      const { error } = await supabase
        .from("vaccinations")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id, petId };
    },
    onSuccess: ({ petId }) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pet(petId) });
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export type VaccinationUpdate = Database["public"]["Tables"]["vaccinations"]["Update"];

export function useUpdateVaccination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: VaccinationUpdate;
    }) => {
      const { data, error } = await supabase
        .from("vaccinations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Vaccination;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pet(data.pet_id) });
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function getVaccinationStatus(
  expiryDate: string
): "valid" | "expiring_soon" | "expired" {
  const expiry = new Date(expiryDate).getTime();
  const now = Date.now();

  if (expiry < now) return "expired";
  if (expiry - now <= THIRTY_DAYS_MS) return "expiring_soon";
  return "valid";
}
