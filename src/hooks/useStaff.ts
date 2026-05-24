import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { staffMatchesSearch } from "@/lib/staffRoles";

export type StaffRole = Database["public"]["Enums"]["staff_role"];
export type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
export type StaffInsert = Database["public"]["Tables"]["staff"]["Insert"];
export type StaffUpdate = Database["public"]["Tables"]["staff"]["Update"];

export const staffKeys = {
  all: ["staff"] as const,
};

export function useStaff(search?: string) {
  return useQuery({
    queryKey: [...staffKeys.all, search ?? ""] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as StaffRow[];
      const q = search?.trim();
      if (!q) return rows;
      return rows.filter((row) => staffMatchesSearch(row, q));
    },
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: StaffInsert) => {
      const { data, error } = await supabase
        .from("staff")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as StaffRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StaffUpdate }) => {
      const { data, error } = await supabase
        .from("staff")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as StaffRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}
