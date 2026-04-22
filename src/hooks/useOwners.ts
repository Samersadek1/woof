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

function ownerSearchScore(owner: OwnerWithPetCount, term: string): number {
  const first = (owner.first_name ?? "").toLowerCase();
  const last = (owner.last_name ?? "").toLowerCase();
  const full = `${first} ${last}`.trim();
  const phone = (owner.phone ?? "").toLowerCase();
  const petNames = (owner.pets ?? []).map((p) => (p.name ?? "").toLowerCase());
  const joinedPetNames = petNames.join(" ");

  if (full.startsWith(term)) return 0;
  if (petNames.some((name) => name.startsWith(term))) return 1;
  if (first.startsWith(term) || last.startsWith(term)) return 2;
  if (phone.startsWith(term)) return 3;
  if (full.includes(term)) return 4;
  if (joinedPetNames.includes(term)) return 5;
  if (phone.includes(term)) return 6;
  return 9;
}

export function useOwners(searchTerm?: string) {
  return useQuery({
    queryKey: queryKeys.owners(searchTerm),
    queryFn: async () => {
      const baseQuery = supabase
        .from("owners")
        .select("*, pets(name, breed)")
        .order("last_name", { ascending: true });

      if (searchTerm) {
        const trimmed = searchTerm.trim();
        if (!trimmed) {
          const { data, error } = await baseQuery;
          if (error) throw error;
          return data as OwnerWithPetCount[];
        }

        const ilike = `%${trimmed}%`;
        const [ownersRes, petsRes] = await Promise.all([
          supabase
            .from("owners")
            .select("*, pets(name, breed)")
            .or(`first_name.ilike.${ilike},last_name.ilike.${ilike},phone.ilike.${ilike}`),
          supabase
            .from("pets")
            .select("owner_id")
            .ilike("name", ilike),
        ]);

        if (ownersRes.error) throw ownersRes.error;
        if (petsRes.error) throw petsRes.error;

        const merged = new Map<string, OwnerWithPetCount>();
        for (const owner of ownersRes.data ?? []) {
          merged.set(owner.id, owner as OwnerWithPetCount);
        }

        const petOwnerIds = Array.from(new Set((petsRes.data ?? []).map((row) => row.owner_id)));
        const missingOwnerIds = petOwnerIds.filter((id) => !merged.has(id));

        if (missingOwnerIds.length > 0) {
          const { data: extraOwners, error: extraErr } = await supabase
            .from("owners")
            .select("*, pets(name, breed)")
            .in("id", missingOwnerIds);
          if (extraErr) throw extraErr;
          for (const owner of extraOwners ?? []) {
            merged.set(owner.id, owner as OwnerWithPetCount);
          }
        }

        const lowered = trimmed.toLowerCase();
        return Array.from(merged.values()).sort((a, b) => {
          const scoreDiff = ownerSearchScore(a, lowered) - ownerSearchScore(b, lowered);
          if (scoreDiff !== 0) return scoreDiff;
          const lastDiff = (a.last_name ?? "").localeCompare(b.last_name ?? "");
          if (lastDiff !== 0) return lastDiff;
          return (a.first_name ?? "").localeCompare(b.first_name ?? "");
        });
      }

      const { data, error } = await baseQuery;
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
