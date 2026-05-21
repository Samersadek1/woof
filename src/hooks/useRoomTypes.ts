import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const roomTypesQueryKey = ["room_types"] as const;

export type RoomTypeRow = {
  slug: string;
  label: string;
  is_builtin: boolean;
  created_at: string;
};

function extractRoomTypeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Something went wrong";
}

function isMissingRoomTypeRpcError(err: unknown): boolean {
  const msg = extractRoomTypeError(err).toLowerCase();
  return (
    msg.includes("create_room_type") &&
    (msg.includes("schema cache") || msg.includes("could not find the function"))
  );
}

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
      const { data, error } = await supabase.rpc("create_room_type", {
        p_label: trimmed,
      });
      if (error) {
        if (isMissingRoomTypeRpcError(error)) {
          throw new Error(
            "Room type setup is missing in Supabase. Run sql/create-room-types.sql in the SQL editor, then try again.",
          );
        }
        throw error;
      }
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: roomTypesQueryKey });
    },
  });
}
