import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildStationGroomerMapForDate,
  daysOffQueryRange,
  type GroomerOffSchedule,
} from "@/lib/groomingStationGroomerSchedule";
import { groomingGroomerQueryKeys, useGroomingGroomers } from "@/hooks/useGroomingGroomers";
import { groomingStationQueryKeys, useGroomingStations } from "@/hooks/useGroomingStations";

export type GroomingStationWeeklyAssignmentRow =
  Database["public"]["Tables"]["grooming_station_weekly_assignments"]["Row"];
export type GroomingGroomerWeeklyOffRow =
  Database["public"]["Tables"]["grooming_groomer_weekly_days_off"]["Row"];
export type GroomingGroomerLeavePeriodRow =
  Database["public"]["Tables"]["grooming_groomer_leave_periods"]["Row"];

export type GroomingStationWeeklyAssignmentWithGroomer = GroomingStationWeeklyAssignmentRow & {
  groomer_name: string;
};

export type GroomingGroomerWeeklyOffWithName = GroomingGroomerWeeklyOffRow & {
  groomer_name: string;
};

export type GroomingGroomerLeavePeriodWithName = GroomingGroomerLeavePeriodRow & {
  groomer_name: string;
};

export const groomingStationScheduleQueryKeys = {
  weekly: () => ["grooming", "station-weekly-assignments"] as const,
  groomerWeeklyOff: () => ["grooming", "groomer-weekly-days-off"] as const,
  leavePeriods: (fromDate: string, toDate: string) =>
    ["grooming", "groomer-leave-periods", fromDate, toDate] as const,
  leavePeriodsAll: () => ["grooming", "groomer-leave-periods"] as const,
};

export function useGroomingStationWeeklyAssignments() {
  return useQuery({
    queryKey: groomingStationScheduleQueryKeys.weekly(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_station_weekly_assignments")
        .select("id, station_id, day_of_week, groomer_id, created_at, grooming_groomers(name)")
        .order("station_id")
        .order("day_of_week");

      if (error) throw error;

      return (data ?? []).map((row) => {
        const groomerJoin = row.grooming_groomers as { name: string } | null;
        const { grooming_groomers: _g, ...rest } = row as typeof row & {
          grooming_groomers: { name: string } | null;
        };
        return {
          ...rest,
          groomer_name: groomerJoin?.name ?? "",
        } as GroomingStationWeeklyAssignmentWithGroomer;
      });
    },
  });
}

export function useUpsertGroomingStationWeeklyAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      station_id: string;
      day_of_week: number;
      groomer_id: string | null;
    }) => {
      if (input.groomer_id == null) {
        const { error } = await supabase
          .from("grooming_station_weekly_assignments")
          .delete()
          .eq("station_id", input.station_id)
          .eq("day_of_week", input.day_of_week);
        if (error) throw error;
        return null;
      }

      const { data, error } = await supabase
        .from("grooming_station_weekly_assignments")
        .upsert(
          {
            station_id: input.station_id,
            day_of_week: input.day_of_week,
            groomer_id: input.groomer_id,
          },
          { onConflict: "station_id,day_of_week" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as GroomingStationWeeklyAssignmentRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.weekly() });
    },
  });
}

export function useGroomingGroomerWeeklyDaysOff() {
  return useQuery({
    queryKey: groomingStationScheduleQueryKeys.groomerWeeklyOff(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_groomer_weekly_days_off")
        .select("id, groomer_id, day_of_week, created_at, grooming_groomers(name)")
        .order("groomer_id")
        .order("day_of_week");

      if (error) throw error;

      return (data ?? []).map((row) => {
        const groomerJoin = row.grooming_groomers as { name: string } | null;
        const { grooming_groomers: _g, ...rest } = row as typeof row & {
          grooming_groomers: { name: string } | null;
        };
        return {
          ...rest,
          groomer_name: groomerJoin?.name ?? "",
        } as GroomingGroomerWeeklyOffWithName;
      });
    },
  });
}

export function useToggleGroomingGroomerWeeklyOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      groomer_id: string;
      day_of_week: number;
      enabled: boolean;
    }) => {
      if (input.enabled) {
        const { data, error } = await supabase
          .from("grooming_groomer_weekly_days_off")
          .upsert(
            { groomer_id: input.groomer_id, day_of_week: input.day_of_week },
            { onConflict: "groomer_id,day_of_week" },
          )
          .select()
          .single();
        if (error) throw error;
        return data as GroomingGroomerWeeklyOffRow;
      }
      const { error } = await supabase
        .from("grooming_groomer_weekly_days_off")
        .delete()
        .eq("groomer_id", input.groomer_id)
        .eq("day_of_week", input.day_of_week);
      if (error) throw error;
      return null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.groomerWeeklyOff() });
    },
  });
}

export function useGroomingGroomerLeavePeriods(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: groomingStationScheduleQueryKeys.leavePeriods(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_groomer_leave_periods")
        .select("id, groomer_id, start_date, end_date, note, created_at, grooming_groomers(name)")
        .lte("start_date", toDate)
        .gte("end_date", fromDate)
        .order("start_date", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => {
        const groomerJoin = row.grooming_groomers as { name: string } | null;
        const { grooming_groomers: _g, ...rest } = row as typeof row & {
          grooming_groomers: { name: string } | null;
        };
        return {
          ...rest,
          groomer_name: groomerJoin?.name ?? "",
        } as GroomingGroomerLeavePeriodWithName;
      });
    },
  });
}

export function useAllGroomingGroomerLeavePeriods() {
  return useQuery({
    queryKey: [...groomingStationScheduleQueryKeys.leavePeriodsAll(), "upcoming"] as const,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("grooming_groomer_leave_periods")
        .select("id, groomer_id, start_date, end_date, note, created_at, grooming_groomers(name)")
        .gte("end_date", today)
        .order("start_date", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => {
        const groomerJoin = row.grooming_groomers as { name: string } | null;
        const { grooming_groomers: _g, ...rest } = row as typeof row & {
          grooming_groomers: { name: string } | null;
        };
        return {
          ...rest,
          groomer_name: groomerJoin?.name ?? "",
        } as GroomingGroomerLeavePeriodWithName;
      });
    },
  });
}

export function useAddGroomerLeavePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      groomer_id: string;
      start_date: string;
      end_date: string;
      note?: string | null;
    }) => {
      const start = input.start_date.slice(0, 10);
      const end = input.end_date.slice(0, 10);
      if (end < start) throw new Error("End date must be on or after start date.");

      const { data, error } = await supabase
        .from("grooming_groomer_leave_periods")
        .insert({
          groomer_id: input.groomer_id,
          start_date: start,
          end_date: end,
          note: input.note?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as GroomingGroomerLeavePeriodRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.leavePeriodsAll() });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "grooming" &&
          q.queryKey[1] === "groomer-leave-periods",
      });
    },
  });
}

export function useRemoveGroomerLeavePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grooming_groomer_leave_periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.leavePeriodsAll() });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "grooming" &&
          q.queryKey[1] === "groomer-leave-periods",
      });
    },
  });
}

export function useStationGroomersForDate(dateIso: string | undefined) {
  const date = dateIso?.slice(0, 10) ?? "";
  const { fromDate, toDate } = useMemo(
    () => (date ? daysOffQueryRange(date) : { fromDate: "", toDate: "" }),
    [date],
  );

  const { data: stations = [] } = useGroomingStations();
  const { data: weekly = [] } = useGroomingStationWeeklyAssignments();
  const { data: weeklyOffDays = [] } = useGroomingGroomerWeeklyDaysOff();
  const { data: leavePeriods = [] } = useGroomingGroomerLeavePeriods(fromDate, toDate);
  const { data: groomers = [] } = useGroomingGroomers();

  const groomersById = useMemo(
    () => new Map(groomers.map((g) => [g.id, g.name] as const)),
    [groomers],
  );

  const offSchedule: GroomerOffSchedule = useMemo(
    () => ({
      weeklyOffDays: weeklyOffDays.map((w) => ({
        groomer_id: w.groomer_id,
        day_of_week: w.day_of_week,
      })),
      leavePeriods: leavePeriods.map((p) => ({
        groomer_id: p.groomer_id,
        start_date: p.start_date,
        end_date: p.end_date,
      })),
    }),
    [weeklyOffDays, leavePeriods],
  );

  const stationGroomerMap = useMemo(() => {
    if (!date) return new Map<string, string | null>();
    return buildStationGroomerMapForDate(
      stations.map((s) => s.id),
      date,
      weekly,
      offSchedule,
      groomersById,
    );
  }, [date, stations, weekly, offSchedule, groomersById]);

  const resolveStationGroomer = useMemo(
    () =>
      (stationId: string): string | null =>
        stationGroomerMap.get(stationId) ?? null,
    [stationGroomerMap],
  );

  return { stationGroomerMap, resolveStationGroomer };
}

export function invalidateGroomingStationScheduleQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.weekly() });
  qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.groomerWeeklyOff() });
  qc.invalidateQueries({ queryKey: groomingStationScheduleQueryKeys.leavePeriodsAll() });
  qc.invalidateQueries({ queryKey: groomingGroomerQueryKeys.all() });
  qc.invalidateQueries({ queryKey: groomingStationQueryKeys.stations() });
}
