import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  DEFAULT_GROOMING_GROOMER_NAMES,
} from "@/lib/groomingGroomerForm";

export type GroomingGroomerRow = Database["public"]["Tables"]["grooming_groomers"]["Row"];

export const groomingGroomerQueryKeys = {
  all: () => ["grooming", "groomers"] as const,
};

function fallbackGroomers(): GroomingGroomerRow[] {
  return DEFAULT_GROOMING_GROOMER_NAMES.map((name, index) => ({
    id: `fallback-${name.toLowerCase()}`,
    name,
    sort_order: index + 1,
    is_active: true,
    created_at: new Date(0).toISOString(),
  }));
}

export function useGroomingGroomers() {
  return useQuery({
    queryKey: groomingGroomerQueryKeys.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_groomers")
        .select("id, name, sort_order, is_active, created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.warn("grooming_groomers unavailable, using defaults:", error.message);
        return fallbackGroomers();
      }
      if (!data?.length) return fallbackGroomers();
      return data as GroomingGroomerRow[];
    },
  });
}

export function useCreateGroomingGroomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Enter a groomer name.");

      const { data: existing, error: existingErr } = await supabase
        .from("grooming_groomers")
        .select("id, is_active")
        .ilike("name", trimmed)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existing?.id) {
        if (existing.is_active) throw new Error("That groomer is already on the list.");
        const { data, error } = await supabase
          .from("grooming_groomers")
          .update({ is_active: true })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as GroomingGroomerRow;
      }

      const { data: maxRow, error: maxErr } = await supabase
        .from("grooming_groomers")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;

      const sortOrder = (maxRow?.sort_order ?? 0) + 1;
      const { data, error } = await supabase
        .from("grooming_groomers")
        .insert({ name: trimmed, sort_order: sortOrder, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data as GroomingGroomerRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingGroomerQueryKeys.all() });
    },
  });
}

export function useDeactivateGroomingGroomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("grooming_groomers")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingGroomerQueryKeys.all() });
    },
  });
}
