import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const roomTypesQueryKey = ["room_types"] as const;

export type RoomTypeRow = {
  slug: string;
  label: string;
  is_builtin: boolean;
  created_at: string;
};

async function fetchRoomTypes(): Promise<RoomTypeRow[]> {
  const { data, error } = await supabase
    .from("room_types")
    .select("slug,label,is_builtin,created_at")
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoomTypeRow[];
}

export function useRoomTypesQuery() {
  return useQuery({
    queryKey: roomTypesQueryKey,
    queryFn: fetchRoomTypes,
  });
}

export function useCreateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error("Name is required");
      const { data, error } = await supabase.rpc("create_room_type", { p_label: trimmed });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: roomTypesQueryKey });
    },
  });
}
