import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type GroomingStationRow = Database["public"]["Tables"]["grooming_stations"]["Row"];
export type GroomingStationBlockRow =
  Database["public"]["Tables"]["grooming_station_blocks"]["Row"];

export const groomingStationQueryKeys = {
  stations: () => ["grooming", "stations"] as const,
  blocks: (date: string) => ["grooming", "station-blocks", date] as const,
};

export function useGroomingStations() {
  return useQuery({
    queryKey: groomingStationQueryKeys.stations(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_stations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as GroomingStationRow[];
    },
  });
}

export function useGroomingStationBlocks(date: string) {
  return useQuery({
    queryKey: groomingStationQueryKeys.blocks(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_station_blocks")
        .select("*")
        .eq("block_date", date)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as GroomingStationBlockRow[];
    },
  });
}

export type CreateGroomingStationBlockInput = {
  station_id: string;
  block_date: string;
  is_full_day: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
  created_by?: string | null;
};

export function useCreateGroomingStationBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateGroomingStationBlockInput) => {
      const { data, error } = await supabase
        .from("grooming_station_blocks")
        .insert({
          station_id: input.station_id,
          block_date: input.block_date,
          is_full_day: input.is_full_day,
          start_time: input.is_full_day ? null : input.start_time ?? null,
          end_time: input.is_full_day ? null : input.end_time ?? null,
          reason: input.reason.trim(),
          created_by: input.created_by ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as GroomingStationBlockRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: groomingStationQueryKeys.blocks(data.block_date) });
    },
  });
}

export function useDeleteGroomingStationBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, blockDate }: { id: string; blockDate: string }) => {
      const { error } = await supabase.from("grooming_station_blocks").delete().eq("id", id);
      if (error) throw error;
      return blockDate;
    },
    onSuccess: (blockDate) => {
      qc.invalidateQueries({ queryKey: groomingStationQueryKeys.blocks(blockDate) });
    },
  });
}

export type GroomingScheduleOverrideInsert = {
  appointment_id: string;
  conflict_type: "appointment_overlap" | "station_block_overlap";
  conflicted_with_id: string;
  reason: string;
  created_by?: string | null;
};

export function useLogGroomingScheduleOverrides() {
  return useMutation({
    mutationFn: async (rows: GroomingScheduleOverrideInsert[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from("grooming_schedule_overrides").insert(rows);
      if (error) throw error;
    },
  });
}
