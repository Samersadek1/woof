import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lastNight } from "@/lib/boardingRoomAssignmentSync";
import type { RoomSizeClass } from "@/lib/boardingCapacity";

export type BoardingNightCapacity = {
  large_rooms: number;
  standard_rooms: number;
  large_required: number;
  total_bookings: number;
  large_free: number;
  total_free: number;
  assigned: number;
  unassigned: number;
  feasible: boolean;
  reason: string;
};

export type BoardingRangeFeasibilityRow = {
  stay_date: string;
  large_free: number;
  total_free: number;
  feasible: boolean;
  reason: string;
};

export type SuggestedBoardingRoom = {
  room_id: string;
  room_label: string;
  size_class: RoomSizeClass;
  is_overflow: boolean;
};

export type BoardingAssignmentValidation = {
  ok: boolean;
  required_class?: RoomSizeClass;
  warnings: { code: string; msg: string }[];
};

export type KennelMapRoom = {
  id: string;
  display_name: string;
  name: string;
  room_number: string;
  zone: string | null;
  size_class: RoomSizeClass;
};

export type KennelMapOccupancy = {
  room_id: string;
  booking_id: string;
  bookings: {
    booking_ref: string | null;
    booking_pets: { pets: { name: string } | null }[];
  } | null;
};

export type UnassignedBoardingRow = {
  booking_id: string;
  booking_ref: string | null;
  owner_id: string;
  owner_name: string | null;
  dog_names: string | null;
  pet_count: number;
  required_class: RoomSizeClass;
  has_restriction: boolean;
  check_in_date: string;
  check_out_date: string;
  do_not_move: boolean;
  arrival: "arriving_today" | "here_now" | "upcoming";
};

export const boardingCapacityKeys = {
  kennelMap: (date: string) => ["kennel-map", date] as const,
  map: (date: string) => ["boarding-map", date] as const,
  cap: (date: string) => ["boarding-cap", date] as const,
  unassigned: (date: string) => ["unassigned", date] as const,
  range: (ci: string, co: string, cls?: RoomSizeClass) =>
    ["boarding-range", ci, co, cls ?? ""] as const,
  eligible: (ci: string, co: string, cls: RoomSizeClass) =>
    ["eligible", ci, co, cls] as const,
};

export function useKennelMap(date: string) {
  return useQuery({
    queryKey: boardingCapacityKeys.kennelMap(date),
    enabled: !!date,
    queryFn: async () => {
      const { data: rooms, error: roomsErr } = await supabase
        .from("rooms")
        .select("id, display_name, name, room_number, zone, size_class")
        .not("size_class", "is", null)
        .eq("is_active", true);
      if (roomsErr) throw roomsErr;

      const { data: occ, error: occErr } = await supabase
        .from("booking_room_assignments")
        .select(
          "room_id, booking_id, bookings(booking_ref, booking_pets(pets(name)))",
        )
        .lte("start_date", date)
        .gte("end_date", date); // inclusive end_date: last occupied night
      if (occErr) throw occErr;

      return {
        rooms: (rooms ?? []) as KennelMapRoom[],
        occ: (occ ?? []) as KennelMapOccupancy[],
      };
    },
  });
}

/** @deprecated Use useKennelMap */
export function useBoardingMap(date: string) {
  return useKennelMap(date);
}

export function useUnassignedQueue(date: string) {
  return useQuery({
    queryKey: boardingCapacityKeys.unassigned(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_unassigned_boarding", {
        p_date: date,
      });
      if (error) throw error;
      return (data ?? []) as UnassignedBoardingRow[];
    },
  });
}

export function useBoardingNightCapacity(date: string) {
  return useQuery({
    queryKey: boardingCapacityKeys.cap(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_boarding_night_capacity", {
        p_date: date,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as BoardingNightCapacity | null;
    },
  });
}

export function useRangeFeasibility(
  checkIn?: string,
  checkOut?: string,
  addingClass?: RoomSizeClass,
) {
  return useQuery({
    enabled: !!checkIn && !!checkOut,
    queryKey: boardingCapacityKeys.range(checkIn!, checkOut!, addingClass),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_boarding_range_feasibility", {
        p_check_in: checkIn!,
        p_check_out: checkOut!,
        p_adding_class: addingClass ?? null,
      });
      if (error) throw error;
      return (data ?? []) as BoardingRangeFeasibilityRow[];
    },
  });
}

export function useEligibleRooms(
  checkIn?: string,
  checkOut?: string,
  requiredClass?: RoomSizeClass,
) {
  return useQuery({
    enabled: !!checkIn && !!checkOut && !!requiredClass,
    queryKey: boardingCapacityKeys.eligible(checkIn!, checkOut!, requiredClass!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("woof_suggest_boarding_room", {
        p_check_in: checkIn!,
        p_check_out: checkOut!,
        p_required_class: requiredClass!,
      });
      if (error) throw error;
      return (data ?? []) as SuggestedBoardingRoom[];
    },
  });
}

export type AssignBoardingRoomInput = {
  bookingId: string;
  roomId: string | null;
  start: string;
  end: string;
  overrideReason?: string;
  staff: string;
};

export class BoardingAssignNeedsOverrideError extends Error {
  warnings: { code: string; msg: string }[];

  constructor(warnings: { code: string; msg: string }[]) {
    super("Boarding assignment needs override");
    this.name = "BoardingAssignNeedsOverrideError";
    this.warnings = warnings;
  }
}

export function useAssignBoardingRoom() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignBoardingRoomInput) => {
      const { data: validation, error: valErr } = await supabase.rpc(
        "woof_validate_boarding_assignment",
        {
          p_booking_id: input.bookingId,
          p_start: input.start,
          p_end: input.end,
          p_room_id: input.roomId,
        },
      );
      if (valErr) throw valErr;

      const v = validation as BoardingAssignmentValidation;
      if (!v.ok) {
        if (!input.overrideReason?.trim()) {
          throw new BoardingAssignNeedsOverrideError(v.warnings ?? []);
        }
        const { error: ovErr } = await supabase.from("boarding_assignment_overrides").insert({
          booking_id: input.bookingId,
          room_id: input.roomId,
          start_date: input.start,
          end_date: input.end,
          warnings: v.warnings,
          reason: input.overrideReason.trim(),
          overridden_by: input.staff,
        });
        if (ovErr) throw ovErr;
      }

      const { error: insErr } = await supabase.from("booking_room_assignments").insert({
        booking_id: input.bookingId,
        room_id: input.roomId,
        start_date: input.start,
        end_date: input.end,
      });
      if (insErr) throw insErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["kennel-map"] });
      qc.invalidateQueries({ queryKey: ["unassigned"] });
      qc.invalidateQueries({ queryKey: ["boarding-map"] });
      qc.invalidateQueries({ queryKey: ["boarding-cap"] });
      qc.invalidateQueries({ queryKey: ["booking_room_assignments"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: boardingCapacityKeys.range(vars.start, vars.end) });
    },
  });
}

/**
 * Assignment segment end = last occupied night (inclusive), matching live
 * `booking_room_assignments` rows and `move_boarding_room` / calendar UI.
 * Booking checkout date is exclusive (no overnight on check_out_date).
 */
export function assignmentEndFromCheckOut(checkOutExclusive: string): string {
  return lastNight(checkOutExclusive);
}

/** Inclusive segment: covers night when start <= night <= end. */
export function assignmentCoversNight(
  start: string,
  endInclusive: string,
  night: string,
): boolean {
  return start <= night && night <= endInclusive;
}
