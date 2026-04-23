import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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
      let query = supabase.from("staff").select("*").order("created_at", { ascending: false });
      const q = search?.trim();
      if (q) {
        query = query.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StaffRow[];
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
