import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  formatDeleteBlockedMessage,
  getOwnerDeleteBlockers,
} from "@/lib/customerDeleteBlockers";
import {
  buildOwnerColumnOrFilter,
  buildPetNameOrFilter,
  ownerMatchesSearch,
  ownerSearchScore,
  ownerSearchTokens,
} from "@/lib/ownerSearch";
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

        // Multi-word queries must not ILIKE the whole string against first_name /
        // last_name alone ("John Smith" never appears in either column). Tokenize
        // and OR each token across columns, then require all tokens client-side.
        const tokens = ownerSearchTokens(trimmed);
        if (tokens.length === 0) {
          const { data, error } = await baseQuery;
          if (error) throw error;
          return data as OwnerWithPetCount[];
        }

        const ownerOr = buildOwnerColumnOrFilter(tokens);
        const petOr = buildPetNameOrFilter(tokens);
        const [ownersRes, petsRes] = await Promise.all([
          supabase
            .from("owners")
            .select("*, pets(name, breed)")
            .or(ownerOr),
          supabase
            .from("pets")
            .select("owner_id")
            .or(petOr),
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

        return Array.from(merged.values())
          .filter((owner) => ownerMatchesSearch(owner, trimmed))
          .sort((a, b) => {
            const scoreDiff = ownerSearchScore(a, trimmed) - ownerSearchScore(b, trimmed);
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
      const blockers = await getOwnerDeleteBlockers(id);
      if (blockers.length > 0) {
        throw new Error(formatDeleteBlockedMessage(blockers));
      }

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
