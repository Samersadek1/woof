import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ParkBooking = Database["public"]["Tables"]["park_bookings"]["Row"];
type ParkBookingInsert = Database["public"]["Tables"]["park_bookings"]["Insert"];
type ParkDayFlag = Database["public"]["Tables"]["park_day_flags"]["Row"];
type ParkDayStatus = Database["public"]["Enums"]["park_day_status"];

export type ParkBookingWithJoins = ParkBooking & {
  owners: { first_name: string; last_name: string; phone: string; other_notes: string | null } | null;
  pets: { name: string; other_notes: string | null } | null;
};

const PARK_JOIN_SELECT =
  "*, owners(first_name, last_name, phone, other_notes), pets(name, other_notes)";

export const queryKeys = {
  parkBookings: (date: string) => ["park", "bookings", date] as const,
  parkDayFlag: (date: string) => ["park", "dayFlag", date] as const,
  ownerParkBookings: (ownerId: string) => ["park", "ownerBookings", ownerId] as const,
  petParkBookings: (petId: string) => ["park", "petBookings", petId] as const,
};

function invalidateOwnerParkBookings(qc: QueryClient, ownerId: string | null | undefined) {
  if (ownerId) {
    qc.invalidateQueries({ queryKey: queryKeys.ownerParkBookings(ownerId) });
  }
}

export function useParkBookings(date: string) {
  return useQuery({
    queryKey: queryKeys.parkBookings(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("park_bookings")
        .select(PARK_JOIN_SELECT)
        .eq("visit_date", date)
        .order("slot_start", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ParkBookingWithJoins[];
    },
  });
}

export function useOwnerParkBookings(ownerId: string) {
  return useQuery({
    queryKey: queryKeys.ownerParkBookings(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("park_bookings")
        .select(PARK_JOIN_SELECT)
        .eq("owner_id", ownerId)
        .order("visit_date", { ascending: false })
        .order("slot_start", { ascending: false })
        .limit(80);

      if (error) throw error;
      return data as ParkBookingWithJoins[];
    },
  });
}

export function usePetParkBookings(petId: string) {
  return useQuery({
    queryKey: queryKeys.petParkBookings(petId),
    enabled: !!petId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("park_bookings")
        .select(PARK_JOIN_SELECT)
        .eq("pet_id", petId)
        .order("visit_date", { ascending: false })
        .order("slot_start", { ascending: false })
        .limit(80);

      if (error) throw error;
      return data as ParkBookingWithJoins[];
    },
  });
}

export function useParkDayFlag(date: string) {
  return useQuery({
    queryKey: queryKeys.parkDayFlag(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("park_day_flags")
        .select("*")
        .eq("visit_date", date)
        .maybeSingle();

      if (error) throw error;
      return data as ParkDayFlag | null;
    },
  });
}

export function useCreateParkBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: ParkBookingInsert) => {
      const { data, error } = await supabase
        .from("park_bookings")
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as ParkBooking;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.parkBookings(variables.visit_date),
      });
      invalidateOwnerParkBookings(queryClient, variables.owner_id);
    },
  });
}

export function useDeleteParkBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      visit_date,
      owner_id,
    }: {
      id: string;
      visit_date: string;
      owner_id: string | null;
    }) => {
      const { error } = await supabase.from("park_bookings").delete().eq("id", id);
      if (error) throw error;
      return { id, visit_date, owner_id };
    },
    onSuccess: ({ visit_date, owner_id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.parkBookings(visit_date),
      });
      invalidateOwnerParkBookings(queryClient, owner_id);
    },
  });
}

export type SetParkDayFlagInput = {
  visit_date: string;
  status: ParkDayStatus;
  notes: string | null;
};

export function useSetParkDayFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ visit_date, status, notes }: SetParkDayFlagInput) => {
      const { data: existing, error: selErr } = await supabase
        .from("park_day_flags")
        .select("id")
        .eq("visit_date", visit_date)
        .maybeSingle();

      if (selErr) throw selErr;

      if (existing?.id) {
        const { data, error } = await supabase
          .from("park_day_flags")
          .update({ status, notes })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data as ParkDayFlag;
      }

      const { data, error } = await supabase
        .from("park_day_flags")
        .insert({ visit_date, status, notes })
        .select()
        .single();

      if (error) throw error;
      return data as ParkDayFlag;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.parkDayFlag(variables.visit_date),
      });
    },
  });
}
