import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { withoutDogSizeColumn } from "@/lib/dogSizeNotes";
import { PET_CARE_NOTES_SELECT } from "@/lib/petCareNotes";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];
type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];
type BookingPetInsert = Database["public"]["Tables"]["booking_pets"]["Insert"];

export type BookingPetDetail = {
  pet_id: string;
  feeding_notes: string | null;
  medication_notes: string | null;
  special_instructions: string | null;
  pets: {
    name: string;
    other_notes: string | null;
    feeding_notes: string | null;
    medication_notes: string | null;
    behaviour_notes: string | null;
    feeding_instructions: string | null;
    medications: string | null;
    behavioural_notes: string | null;
    special_alerts: Database["public"]["Tables"]["pets"]["Row"]["special_alerts"];
  } | null;
};

export type BookingWithDetails = Booking & {
  rooms: Room | null;
  owners: { first_name: string; last_name: string; other_notes: string | null } | null;
  booking_pets: BookingPetDetail[];
  /** Populated via `booking_items(count)` for calendar badges */
  booking_items?: { count: number }[];
};

const BOOKING_BASE_SELECT =
  `*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, other_notes, ${PET_CARE_NOTES_SELECT}, special_alerts))`;

const BOOKING_DETAIL_SELECT =
  `${BOOKING_BASE_SELECT}, booking_items(count)`;

/** Payload accepted by useCreateBooking — booking fields + pet_ids to link */
export type CreateBookingPayload = Omit<BookingInsert, "id" | "created_at" | "updated_at"> & {
  pet_ids: string[];
  pet_care_by_pet_id?: Record<
    string,
    {
      feeding_notes?: string | null;
      medication_notes?: string | null;
      special_instructions?: string | null;
    }
  >;
};

export function isAssessmentRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("has not passed behavioural assessment");
}

export const queryKeys = {
  bookings: (startDate: string, endDate: string) =>
    ["bookings", startDate, endDate] as const,
  ownerBookings: (ownerId: string) => ["bookings", "owner", ownerId] as const,
  petBookings: (petId: string) => ["bookings", "pet", petId] as const,
  rooms: () => ["rooms"] as const,
  bookingRoomAssignments: (startDate: string, endDate: string) =>
    ["booking_room_assignments", startDate, endDate] as const,
};

/** Segment from `booking_room_assignments` — used by the boarding calendar for imported stays. */
export type CalendarRoomAssignment = {
  id: string;
  booking_id: string;
  room_id: string;
  start_date: string;
  end_date: string;
  rooms: Room;
  bookings: BookingWithDetails;
};

export function useBookings(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.bookings(startDate, endDate),
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_DETAIL_SELECT)
        .lte("check_in_date", endDate)
        .gte("check_out_date", startDate)
        .neq("status", "cancelled")
        .order("check_in_date", { ascending: true });

      if (error) {
        if (error.message?.includes("booking_items")) {
          const { data: d2, error: e2 } = await supabase
            .from("bookings")
            .select(BOOKING_BASE_SELECT)
            .lte("check_in_date", endDate)
            .gte("check_out_date", startDate)
            .neq("status", "cancelled")
            .order("check_in_date", { ascending: true });
          if (e2) throw e2;
          return d2 as BookingWithDetails[];
        }
        throw error;
      }
      return data as BookingWithDetails[];
    },
  });
}

/** Past and upcoming stays for a customer profile (includes cancelled). */
export function useOwnerBookings(ownerId: string) {
  return useQuery({
    queryKey: queryKeys.ownerBookings(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_DETAIL_SELECT)
        .eq("owner_id", ownerId)
        .order("check_in_date", { ascending: false })
        .order("check_out_date", { ascending: false })
        .limit(80);

      if (error) {
        if (error.message?.includes("booking_items")) {
          const { data: d2, error: e2 } = await supabase
            .from("bookings")
            .select(BOOKING_BASE_SELECT)
            .eq("owner_id", ownerId)
            .order("check_in_date", { ascending: false })
            .order("check_out_date", { ascending: false })
            .limit(80);
          if (e2) throw e2;
          return d2 as BookingWithDetails[];
        }
        throw error;
      }
      return data as BookingWithDetails[];
    },
  });
}

/** Stays that include this pet (includes cancelled). Full booking_pets rows for shared stays. */
export function usePetBookings(petId: string) {
  return useQuery({
    queryKey: queryKeys.petBookings(petId),
    enabled: !!petId,
    queryFn: async () => {
      const { data: links, error: e1 } = await supabase
        .from("booking_pets")
        .select("booking_id")
        .eq("pet_id", petId)
        .limit(200);

      if (e1) throw e1;
      const bookingIds = [...new Set((links ?? []).map((r) => r.booking_id))];
      if (bookingIds.length === 0) return [] as BookingWithDetails[];

      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_DETAIL_SELECT)
        .in("id", bookingIds)
        .order("check_in_date", { ascending: false })
        .order("check_out_date", { ascending: false })
        .limit(80);

      if (error) {
        if (error.message?.includes("booking_items")) {
          const { data: d2, error: e2 } = await supabase
            .from("bookings")
            .select(BOOKING_BASE_SELECT)
            .in("id", bookingIds)
            .order("check_in_date", { ascending: false })
            .order("check_out_date", { ascending: false })
            .limit(80);
          if (e2) throw e2;
          return d2 as BookingWithDetails[];
        }
        throw error;
      }
      return data as BookingWithDetails[];
    },
  });
}

const CALENDAR_ASSIGNMENT_SELECT = `
  id,
  booking_id,
  room_id,
  start_date,
  end_date,
  rooms (*),
  bookings (${BOOKING_BASE_SELECT})
`;

export function useBookingRoomAssignments(
  startDate: string,
  endDate: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.bookingRoomAssignments(startDate, endDate),
    enabled: options?.enabled ?? (!!startDate && !!endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_room_assignments")
        .select(CALENDAR_ASSIGNMENT_SELECT)
        .lte("start_date", endDate)
        .gte("end_date", startDate);

      if (error) throw error;

      return (data ?? []).filter((row) => {
        const booking = row.bookings as BookingWithDetails | null;
        if (!booking || booking.status === "cancelled") return false;
        if (booking.booking_type && booking.booking_type !== "boarding") return false;
        return true;
      }) as CalendarRoomAssignment[];
    },
  });
}

export function useRooms() {
  return useQuery({
    queryKey: queryKeys.rooms(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("is_active", true)
        .order("wing", { ascending: true })
        .order("room_number", { ascending: true });

      if (error) throw error;
      return data as Room[];
    },
  });
}

/** Fetches ALL rooms regardless of active status — used by the admin table */
export function useAllRooms() {
  return useQuery({
    queryKey: ["rooms", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("display_name", { ascending: true })
        .order("wing", { ascending: true })
        .order("room_number", { ascending: true });

      if (error) throw error;
      return data as Room[];
    },
  });
}

type RoomUpdate = Database["public"]["Tables"]["rooms"]["Update"];
type RoomInsert = Database["public"]["Tables"]["rooms"]["Insert"];

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: RoomUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("rooms")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Room;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Room[]>(["rooms", "all"], (old) =>
        old ? old.map((r) => (r.id === data.id ? data : r)) : old,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms() });
    },
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RoomInsert) => {
      const { data, error } = await supabase.from("rooms").insert(payload).select().single();
      if (error) throw error;
      return data as Room;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: linkedBookings, error: checkErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("room_id", id)
        .limit(1);
      if (checkErr) throw checkErr;
      if (linkedBookings && linkedBookings.length > 0) {
        throw new Error("Cannot delete a room that has bookings assigned to it.");
      }

      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pet_ids,
      pet_care_by_pet_id,
      ...bookingData
    }: CreateBookingPayload) => {
      const payload: BookingInsert = {
        ...withoutDogSizeColumn(bookingData),
        booking_type: bookingData.booking_type ?? "boarding",
      };
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert(payload)
        .select()
        .single();

      if (bookingError) {
        throw bookingError;
      }

      if (pet_ids.length > 0) {
        const bookingPets: BookingPetInsert[] = pet_ids.map((pet_id) => ({
          booking_id: booking.id,
          pet_id,
          feeding_notes: pet_care_by_pet_id?.[pet_id]?.feeding_notes ?? null,
          medication_notes: pet_care_by_pet_id?.[pet_id]?.medication_notes ?? null,
          special_instructions: pet_care_by_pet_id?.[pet_id]?.special_instructions ?? null,
        }));

        const { error: petsError } = await supabase
          .from("booking_pets")
          .insert(bookingPets);

        if (petsError) {
          throw petsError;
        }
      }

      return booking as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: BookingUpdate & { id: string }) => {
      const payload = withoutDogSizeColumn(updates);
      const { data, error } = await supabase
        .from("bookings")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase
        .from("bookings")
        .update({
          status: "checked_in",
          actual_check_in_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .select()
        .single();

      if (error) throw error;
      return data as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase
        .from("bookings")
        .update({
          status: "checked_out",
          actual_check_out_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .select()
        .single();

      if (error) throw error;
      return data as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
