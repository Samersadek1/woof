import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type GroomingRow = Database["public"]["Tables"]["grooming_appointments"]["Row"];
type GroomingInsert = Database["public"]["Tables"]["grooming_appointments"]["Insert"];
type GroomingUpdate = Database["public"]["Tables"]["grooming_appointments"]["Update"];

const GROOMING_JOIN_SELECT =
  "*, owners(first_name, last_name, phone, other_notes), pets(name, breed, weight_kg, grooming_notes, colour, other_notes), staff(first_name, last_name)";

export type GroomingAppointmentWithJoins = GroomingRow & {
  owners: { first_name: string; last_name: string; phone: string; other_notes: string | null } | null;
  pets: {
    name: string;
    breed: string | null;
    weight_kg: number | null;
    grooming_notes: string | null;
    colour: string | null;
    other_notes: string | null;
  } | null;
  staff: { first_name: string; last_name: string } | null;
};

export const queryKeys = {
  groomingDay: (date: string) => ["grooming", "day", date] as const,
  groomingHistory: (petId: string) => ["grooming", "history", petId] as const,
  groomingSearch: (term: string) => ["grooming", "search", term] as const,
  ownerGrooming: (ownerId: string) => ["grooming", "owner", ownerId] as const,
};

function invalidateGrooming(
  qc: QueryClient,
  opts: { appointmentDate?: string; petId?: string; ownerId?: string },
) {
  if (opts.appointmentDate) {
    qc.invalidateQueries({ queryKey: queryKeys.groomingDay(opts.appointmentDate) });
  }
  if (opts.petId) {
    qc.invalidateQueries({ queryKey: queryKeys.groomingHistory(opts.petId) });
  }
  if (opts.ownerId) {
    qc.invalidateQueries({ queryKey: queryKeys.ownerGrooming(opts.ownerId) });
  }
  qc.invalidateQueries({ queryKey: ["grooming", "search"] });
}

export function useGroomingAppointments(date: string) {
  return useQuery({
    queryKey: queryKeys.groomingDay(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .select(GROOMING_JOIN_SELECT)
        .eq("appointment_date", date)
        .order("appointment_time", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as GroomingAppointmentWithJoins[];
    },
  });
}

export function useGroomingHistory(petId: string, limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.groomingHistory(petId), limit] as const,
    enabled: !!petId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .select(GROOMING_JOIN_SELECT)
        .eq("pet_id", petId)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as GroomingAppointmentWithJoins[];
    },
  });
}

/** Client-filtered search across loaded rows (pet / owner names). */
export function useGroomingGlobalSearch(searchTerm: string) {
  const term = searchTerm.trim();
  return useQuery({
    queryKey: queryKeys.groomingSearch(term),
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .select(GROOMING_JOIN_SELECT)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(400);

      if (error) throw error;
      const rows = data as GroomingAppointmentWithJoins[];
      const q = term.toLowerCase();
      return rows.filter((r) => {
        const pet = r.pets?.name?.toLowerCase() ?? "";
        const o = r.owners;
        const ownerStr = o ? `${o.first_name} ${o.last_name}`.toLowerCase() : "";
        const phone = o?.phone?.toLowerCase() ?? "";
        return pet.includes(q) || ownerStr.includes(q) || phone.includes(q);
      });
    },
  });
}

export function useCreateGroomingAppointment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (row: GroomingInsert) => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .insert({
          ...row,
          status: row.status ?? "scheduled",
          no_show: row.no_show ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as GroomingRow;
    },
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

export function useOwnerGroomingAppointments(ownerId: string) {
  return useQuery({
    queryKey: queryKeys.ownerGrooming(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .select(GROOMING_JOIN_SELECT)
        .eq("owner_id", ownerId)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false, nullsFirst: false })
        .limit(80);

      if (error) throw error;
      return data as GroomingAppointmentWithJoins[];
    },
  });
}

export function useUpdateGroomingAppointment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: GroomingUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as GroomingRow;
    },
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

export function useMarkInProgress() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .update({
          status: "in_progress",
          in_progress_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as GroomingRow;
    },
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

export function useMarkComplete() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as GroomingRow;
    },
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

export function useMarkNoShow() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .update({
          status: "cancelled",
          no_show: true,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as GroomingRow;
    },
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

export type BookingLinkRow = {
  id: string;
  booking_ref: string | null;
  owner_id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  owners: { first_name: string; last_name: string } | null;
};

/** Search boarding stays by booking ref or owner name / phone for linking to a groom. */
export function useBookingsForGroomingLink(searchTerm: string) {
  const q = searchTerm.trim();
  return useQuery({
    queryKey: ["grooming", "bookingLink", q] as const,
    enabled: q.length >= 2,
    queryFn: async () => {
      const pat = `%${q}%`;
      const orOwners = `first_name.ilike.${pat},last_name.ilike.${pat},phone.ilike.${pat}`;

      const { data: byRef, error: e1 } = await supabase
        .from("bookings")
        .select(
          "id, booking_ref, owner_id, check_in_date, check_out_date, status, owners(first_name, last_name)",
        )
        .ilike("booking_ref", pat)
        .neq("status", "cancelled")
        .limit(15);

      if (e1) throw e1;

      const { data: ownerRows, error: e2 } = await supabase
        .from("owners")
        .select("id")
        .or(orOwners)
        .limit(12);

      if (e2) throw e2;

      const merged: BookingLinkRow[] = [...((byRef ?? []) as BookingLinkRow[])];
      const seen = new Set(merged.map((b) => b.id));

      const ownerIds = ownerRows?.map((o) => o.id) ?? [];
      if (ownerIds.length) {
        const { data: byOwner, error: e3 } = await supabase
          .from("bookings")
          .select(
            "id, booking_ref, owner_id, check_in_date, check_out_date, status, owners(first_name, last_name)",
          )
          .in("owner_id", ownerIds)
          .neq("status", "cancelled")
          .order("check_out_date", { ascending: false })
          .limit(15);

        if (e3) throw e3;
        for (const b of (byOwner ?? []) as BookingLinkRow[]) {
          if (!seen.has(b.id)) {
            seen.add(b.id);
            merged.push(b);
          }
        }
      }

      return merged.slice(0, 20);
    },
  });
}
