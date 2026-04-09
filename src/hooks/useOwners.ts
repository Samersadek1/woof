import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Owner = Database["public"]["Tables"]["owners"]["Row"];
type OwnerInsert = Database["public"]["Tables"]["owners"]["Insert"];
type OwnerUpdate = Database["public"]["Tables"]["owners"]["Update"];
type Pet = Database["public"]["Tables"]["pets"]["Row"];

export type OwnerWithPets = Owner & { pets: Pet[] };

/** Embedded pets from list query (name + breed for table display). */
export type OwnerPetSummary = Pick<Pet, "name" | "breed">;

export type OwnerWithPetCount = Owner & { pets: OwnerPetSummary[] | null };

export const queryKeys = {
  owners: (searchTerm?: string) => ["owners", searchTerm ?? ""] as const,
  owner: (id: string) => ["owners", id] as const,
};

export function useOwners(searchTerm?: string) {
  return useQuery({
    queryKey: queryKeys.owners(searchTerm),
    queryFn: async () => {
      let query = supabase
        .from("owners")
        .select("*, pets(name, breed)")
        .order("last_name", { ascending: true });

      if (searchTerm) {
        const term = `%${searchTerm}%`;
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OwnerWithPetCount[];
    },
  });
}

export function useOwner(id: string) {
  return useQuery({
    queryKey: queryKeys.owner(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owners")
        .select("*, pets(*)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as OwnerWithPets;
    },
  });
}

export function useCreateOwner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (owner: OwnerInsert) => {
      const { data, error } = await supabase
        .from("owners")
        .insert(owner)
        .select()
        .single();

      if (error) throw error;
      return data as Owner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}

export function useUpdateOwner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: OwnerUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("owners")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Owner;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["owners"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.owner(data.id) });
    },
  });
}

export function useDeleteOwner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete all pets belonging to this owner first, then the owner row.
      // If the database has ON DELETE CASCADE configured this is a no-op
      // for pets, but we do it explicitly so the UI stays correct regardless.
      const { error: petsError } = await supabase
        .from("pets")
        .delete()
        .eq("owner_id", id);

      if (petsError) throw petsError;

      const { error } = await supabase.from("owners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}
