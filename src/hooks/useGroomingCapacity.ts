import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type GroomingRow = Database["public"]["Tables"]["grooming_appointments"]["Row"];
type GroomingInsert = Database["public"]["Tables"]["grooming_appointments"]["Insert"];
type GroomingService = Database["public"]["Enums"]["grooming_service"];

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

export type GroomingBacklogRow = {
  appt_id: string;
  pet_id: string;
  owner_id: string;
  dog_name: string | null;
  pet_size: string | null;
  service: GroomingService;
  duration_minutes: number;
  source_booking_id: string | null;
  booking_ref: string | null;
};

export type GroomingPinnedAppt = Pick<
  GroomingRow,
  | "id"
  | "pet_id"
  | "owner_id"
  | "station_id"
  | "groomer_id"
  | "service"
  | "appointment_date"
  | "appointment_time"
  | "duration_minutes"
  | "status"
  | "no_show"
  | "booking_id"
  | "notes"
  | "grooming_notes"
> & {
  pets: { name: string; size: string | null } | null;
  owners: { first_name: string; last_name: string } | null;
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

const PINNED_SELECT =
  "id, pet_id, owner_id, station_id, groomer_id, service, appointment_date, appointment_time, duration_minutes, status, no_show, booking_id, notes, grooming_notes, pets(name, size), owners(first_name, last_name)";

export function useGroomingDay(date: string) {
  return useQuery({
    queryKey: groomingCapacityKeys.day(date),
    enabled: !!date,
    queryFn: async () => {
      const [capRes, loadRes, pinnedRes, backlogRes] = await Promise.all([
        supabase.rpc("woof_grooming_day_capacity", { p_date: date }),
        supabase.rpc("woof_grooming_station_load", { p_date: date }),
        supabase
          .from("grooming_appointments")
          .select(PINNED_SELECT)
          .eq("appointment_date", date)
          .not("appointment_time", "is", null)
          .not("station_id", "is", null),
        supabase.rpc("woof_grooming_backlog", { p_date: date }),
      ]);
      if (capRes.error) throw capRes.error;
      if (loadRes.error) throw loadRes.error;
      if (pinnedRes.error) throw pinnedRes.error;
      if (backlogRes.error) throw backlogRes.error;

      const pinned = (pinnedRes.data ?? []) as GroomingPinnedAppt[];

      return {
        capacity: (capRes.data?.[0] ?? null) as GroomingDayCapacity | null,
        stations: (loadRes.data ?? []) as GroomingStationLoad[],
        pinned,
        backlog: (backlogRes.data ?? []) as GroomingBacklogRow[],
      };
    },
  });
}

/** @deprecated Prefer `useGroomingDay` — same query. */
export const useGroomingDayBoard = useGroomingDay;

export function useGroomDefaultMinutes(service?: string, size?: string) {
  return useQuery({
    enabled: !!service && !!size,
    queryKey: groomingCapacityKeys.defaultMinutes(service ?? "", size ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_grooming_default_minutes", {
        p_service: service as GroomingService,
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

export async function rpcValidateGroomingAppt(params: {
  date: string;
  stationId: string | null;
  start: string | null;
  duration: number;
  apptId?: string | null;
}): Promise<GroomingApptValidation> {
  const { data, error } = await supabase.rpc("woof_validate_grooming_appt", {
    p_date: params.date,
    p_station_id: params.stationId,
    p_start: params.start,
    p_duration: params.duration,
    p_appt_id: params.apptId ?? null,
  });
  if (error) throw error;
  return data as GroomingApptValidation;
}

export async function logGroomingCapacityOverride(params: {
  appointmentId: string | null;
  jobDate: string;
  warnings: { code: string; msg: string }[];
  reason: string;
  staff?: string | null;
}) {
  const { error } = await supabase.from("grooming_overrides").insert({
    appointment_id: params.appointmentId,
    job_date: params.jobDate,
    warnings: params.warnings,
    reason: params.reason.trim(),
    overridden_by: params.staff ?? null,
  });
  if (error) throw error;
}

export function useScheduleGroomingAppt() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ScheduleGroomingApptInput) => {
      const duration = input.duration_minutes ?? 45;
      const { data: validation, error: valErr } = await supabase.rpc(
        "woof_validate_grooming_appt",
        {
          p_date: input.appointment_date,
          p_station_id: input.station_id ?? null,
          p_start: input.appointment_time ?? null,
          p_duration: duration,
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
      const payload = { ...row, duration_minutes: duration };
      if (id) {
        const { error } = await supabase.from("grooming_appointments").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("grooming_appointments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: groomingCapacityKeys.day(vars.appointment_date) });
      qc.invalidateQueries({ queryKey: ["grooming", "day", vars.appointment_date] });
    },
  });
}
