import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validatePeakPeriodInput, type PeakPeriodInput } from "@/lib/peakPeriods";

export type PeakPeriodRow = Database["public"]["Tables"]["peak_periods"]["Row"];

const peakPeriodsKey = ["peak_periods"] as const;

export function usePeakPeriods() {
  return useQuery({
    queryKey: peakPeriodsKey,
    queryFn: async (): Promise<PeakPeriodRow[]> => {
      const { data, error } = await supabase
        .from("peak_periods")
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertPeakPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PeakPeriodInput & { id?: string | null }) => {
      const validation = validatePeakPeriodInput(input);
      if (validation.ok === false) {
        throw new Error(validation.message);
      }

      const { data, error } = await supabase.rpc("upsert_peak_period", {
        p_id: input.id ?? undefined,
        p_label: input.label?.trim() || undefined,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_notes: input.notes?.trim() || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peakPeriodsKey });
      toast.success("Peak period saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save peak period");
    },
  });
}

export function useDeactivatePeakPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("deactivate_peak_period", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peakPeriodsKey });
      toast.success("Peak period removed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove peak period");
    },
  });
}
