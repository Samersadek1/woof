import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type GroomingRow = Database["public"]["Tables"]["grooming_appointments"]["Row"];
type GroomingInsert = Database["public"]["Tables"]["grooming_appointments"]["Insert"];

export type GroomingDayCapacity = {
  stations: number;
  window_minutes: number;
  total_minutes: number;
  committed_minutes: number;
  free_minutes: number;
  pinned_minutes: number;
  floating_minutes: number;
  feasible: boolean;
};

export type GroomingStationLoad = {
  station_id: string;
  station_name: string;
  window_minutes: number;
  used_minutes: number;
  free_minutes: number;
};

export type GroomingApptValidation = {
  ok: boolean;
  warnings: { code: string; msg: string }[];
};

export const groomingCapacityKeys = {
  day: (date: string) => ["grooming-day", date] as const,
  defaultMinutes: (service: string, size: string) =>
    ["groom-default", service, size] as const,
};

export function useGroomingDayBoard(date: string) {
  return useQuery({
    queryKey: groomingCapacityKeys.day(date),
    enabled: !!date,
    queryFn: async () => {
      const [capRes, loadRes, apptsRes] = await Promise.all([
        supabase.rpc("woof_grooming_day_capacity", { p_date: date }),
        supabase.rpc("woof_grooming_station_load", { p_date: date }),
        supabase.from("grooming_appointments").select("*").eq("appointment_date", date),
      ]);
      if (capRes.error) throw capRes.error;
      if (loadRes.error) throw loadRes.error;
      if (apptsRes.error) throw apptsRes.error;

      return {
        capacity: (capRes.data?.[0] ?? null) as GroomingDayCapacity | null,
        stations: (loadRes.data ?? []) as GroomingStationLoad[],
        appts: (apptsRes.data ?? []) as GroomingRow[],
      };
    },
  });
}

export function useGroomDefaultMinutes(service?: string, size?: string) {
  return useQuery({
    enabled: !!service && !!size,
    queryKey: groomingCapacityKeys.defaultMinutes(service ?? "", size ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_grooming_default_minutes", {
        p_service: service as Database["public"]["Enums"]["grooming_service"],
        p_size: size!,
      });
      if (error) throw error;
      return data as number;
    },
  });
}

export type ScheduleGroomingApptInput = GroomingInsert & {
  id?: string;
  overrideReason?: string;
  staff?: string;
};

export class GroomingScheduleNeedsOverrideError extends Error {
  warnings: { code: string; msg: string }[];

  constructor(warnings: { code: string; msg: string }[]) {
    super("Grooming schedule needs override");
    this.name = "GroomingScheduleNeedsOverrideError";
    this.warnings = warnings;
  }
}

export function useScheduleGroomingAppt() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ScheduleGroomingApptInput) => {
      const { data: validation, error: valErr } = await supabase.rpc(
        "woof_validate_grooming_appt",
        {
          p_date: input.appointment_date,
          p_station_id: input.station_id ?? null,
          p_start: input.appointment_time ?? null,
          p_duration: input.duration_minutes,
          p_appt_id: input.id ?? null,
        },
      );
      if (valErr) throw valErr;

      const v = validation as GroomingApptValidation;
      if (!v.ok) {
        if (!input.overrideReason?.trim()) {
          throw new GroomingScheduleNeedsOverrideError(v.warnings ?? []);
        }
        const { error: ovErr } = await supabase.from("grooming_overrides").insert({
          appointment_id: input.id ?? null,
          job_date: input.appointment_date,
          warnings: v.warnings,
          reason: input.overrideReason.trim(),
          overridden_by: input.staff ?? null,
        });
        if (ovErr) throw ovErr;
      }

      const { id, overrideReason: _r, staff: _s, ...row } = input;
      if (id) {
        const { error } = await supabase.from("grooming_appointments").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("grooming_appointments").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: groomingCapacityKeys.day(vars.appointment_date) });
      qc.invalidateQueries({ queryKey: ["grooming", "day", vars.appointment_date] });
    },
  });
}
