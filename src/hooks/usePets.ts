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
      const { error: updateError } = await supabase
        .from("pets")
        .update(updates)
        .eq("id", id);

      if (updateError) throw updateError;

      const { data, error: fetchError } = await supabase
        .from("pets")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;
      return data as Pet;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pets(data.owner_id) });
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pet(data.id) });
    },
  });
}

const PET_REFERENCE_CHECKS = [
  { table: "booking_pets" as const, label: "boarding bookings" },
  { table: "grooming_appointments" as const, label: "grooming appointments" },
  { table: "daycare_packages" as const, label: "daycare packages" },
  { table: "daycare_sessions" as const, label: "daycare sessions" },
  { table: "park_bookings" as const, label: "park bookings" },
  { table: "waiting_list" as const, label: "waiting list entries" },
  { table: "feeding_schedules" as const, label: "feeding schedules" },
  { table: "daily_notes" as const, label: "daily notes" },
  { table: "stay_medications" as const, label: "stay medications" },
];

async function getPetDeleteBlockers(petId: string): Promise<string[]> {
  const blockers: string[] = [];

  for (const { table, label } of PET_REFERENCE_CHECKS) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("pet_id", petId);

    if (error) throw error;
    if (count && count > 0) blockers.push(label);
  }

  return blockers;
}

export function useDeletePet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ownerId }: { id: string; ownerId: string }) => {
      const blockers = await getPetDeleteBlockers(id);
      if (blockers.length > 0) {
        throw new Error(
          `This pet cannot be deleted because they have existing ${blockers.join(", ")}.`,
        );
      }

      const { error: vacError } = await supabase
        .from("vaccinations")
        .delete()
        .eq("pet_id", id);
      if (vacError) throw vacError;

      const { error } = await supabase.from("pets").delete().eq("id", id);
      if (error) throw error;

      return { id, ownerId };
    },
    onSuccess: ({ id, ownerId }) => {
      queryClient.invalidateQueries({ queryKey: petQueryKeys.pets(ownerId) });
      queryClient.removeQueries({ queryKey: petQueryKeys.pet(id) });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
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
