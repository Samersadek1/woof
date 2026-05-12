import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  GROOMING_WORKFLOW_STATUSES,
  timestampClearsForUndoTo,
  timestampSetsForForwardStep,
  type GroomingWorkflowStatus,
} from "@/lib/groomingWorkflow";

type GroomingRow = Database["public"]["Tables"]["grooming_appointments"]["Row"];
type GroomingInsert = Database["public"]["Tables"]["grooming_appointments"]["Insert"];
type GroomingUpdate = Database["public"]["Tables"]["grooming_appointments"]["Update"];

const GROOMING_JOIN_SELECT =
  "*, owners(first_name, last_name, phone, other_notes), pets(name, breed, weight_kg, grooming_notes, colour, other_notes, special_alerts)";

export type GroomingAppointmentWithJoins = GroomingRow & {
  owners: { first_name: string; last_name: string; phone: string; other_notes: string | null } | null;
  pets: {
    name: string;
    breed: string | null;
    weight_kg: number | null;
    grooming_notes: string | null;
    colour: string | null;
    other_notes: string | null;
    special_alerts: Database["public"]["Tables"]["pets"]["Row"]["special_alerts"];
  } | null;
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
  qc.invalidateQueries({ queryKey: ["grooming", "lastCompletedByPets"] });
  qc.invalidateQueries({ queryKey: ["grooming", "dayInvoices"] });
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
          status: row.status ?? "new",
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

/** Insert audit row + update appointment status (and workflow timestamps). */
export async function runGroomingStatusTransition(params: {
  id: string;
  toStatus: string;
  isUndo?: boolean;
}): Promise<GroomingRow> {
  const { data: current, error: fetchErr } = await supabase
    .from("grooming_appointments")
    .select("id, status, appointment_date, pet_id, owner_id")
    .eq("id", params.id)
    .single();
  if (fetchErr) throw fetchErr;

  const fromStatus = current.status;
  const now = new Date().toISOString();

  const patch: GroomingUpdate = { status: params.toStatus };
  if (params.toStatus === "cancelled") {
    patch.no_show = false;
  }

  if (params.isUndo) {
    const target = params.toStatus as GroomingWorkflowStatus;
    if ((GROOMING_WORKFLOW_STATUSES as readonly string[]).includes(target)) {
      Object.assign(patch, timestampClearsForUndoTo(target) as GroomingUpdate);
    }
  } else if (
    (GROOMING_WORKFLOW_STATUSES as readonly string[]).includes(params.toStatus)
  ) {
    Object.assign(
      patch,
      timestampSetsForForwardStep(params.toStatus as GroomingWorkflowStatus, now) as GroomingUpdate,
    );
  }

  const { error: logErr } = await supabase.from("grooming_status_events").insert({
    appointment_id: params.id,
    from_status: fromStatus,
    to_status: params.toStatus,
  });
  if (logErr) throw logErr;

  const { data: updated, error: upErr } = await supabase
    .from("grooming_appointments")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (upErr) throw upErr;
  return updated as GroomingRow;
}

export function useGroomingStatusTransition() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: runGroomingStatusTransition,
    onSuccess: (data) => {
      invalidateGrooming(qc, {
        appointmentDate: data.appointment_date,
        petId: data.pet_id,
        ownerId: data.owner_id,
      });
    },
  });
}

/** Draft invoice created at booking time (service_id = grooming appointment id). */
export function useInvoiceForGroomingAppointment(appointmentId: string | null) {
  return useQuery({
    queryKey: ["invoice", "grooming", appointmentId],
    enabled: !!appointmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, total, total_aed, vat_aed, payment_method")
        .eq("service_id", appointmentId!)
        .eq("service_type", "grooming")
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        invoice_number: string | null;
        status: string;
        total: number | null;
        total_aed: number | null;
        vat_aed: number | null;
        payment_method: string | null;
      } | null;
    },
  });
}

export function useMarkInProgress() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => runGroomingStatusTransition({ id, toStatus: "in_progress" }),
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
    mutationFn: (id: string) => runGroomingStatusTransition({ id, toStatus: "completed" }),
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

export type GroomingDayInvoiceRow = {
  id: string;
  service_id: string;
  status: string;
  total: number | null;
  total_aed: number | null;
};

/** Invoices linked to grooming appointments (`service_id` = appointment id). */
export function useGroomingDayInvoices(
  appointmentIds: readonly string[],
  options?: { enabled?: boolean },
) {
  const sortedKey = [...appointmentIds].sort().join(",");
  const extraEnabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["grooming", "dayInvoices", sortedKey] as const,
    enabled: extraEnabled && appointmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, service_id, status, total, total_aed")
        .eq("service_type", "grooming")
        .in("service_id", [...appointmentIds]);
      if (error) throw error;
      return (data ?? []) as GroomingDayInvoiceRow[];
    },
  });
}

function invoiceAmountAed(row: Pick<GroomingDayInvoiceRow, "total_aed" | "total">): number {
  const n = row.total_aed ?? row.total;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

const INVOICE_PENDING_REVENUE_STATUSES = [
  "draft",
  "finalised",
  "issued",
  "outstanding",
  "overdue",
  "partially_paid",
] as const;

export function sumGroomingInvoicePaidAed(rows: readonly GroomingDayInvoiceRow[]): number {
  let s = 0;
  for (const r of rows) {
    if (r.status === "paid") s += invoiceAmountAed(r);
  }
  return Number(s.toFixed(2));
}

export function sumGroomingInvoicePendingAed(rows: readonly GroomingDayInvoiceRow[]): number {
  let s = 0;
  for (const r of rows) {
    if ((INVOICE_PENDING_REVENUE_STATUSES as readonly string[]).includes(r.status)) {
      s += invoiceAmountAed(r);
    }
  }
  return Number(s.toFixed(2));
}

function apptTimeSortKey(t: string | null): string {
  if (!t || t.length < 8) return "00:00:00";
  return t.slice(0, 8);
}

/** Latest `appointment_date` per pet among `completed` / `paid` grooms. */
export function useLastGroomingDateByPetIds(
  petIds: readonly string[],
  options?: { enabled?: boolean },
) {
  const sortedKey = [...petIds].sort().join(",");
  const extraEnabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["grooming", "lastCompletedByPets", sortedKey] as const,
    enabled: extraEnabled && petIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_appointments")
        .select("pet_id, appointment_date, appointment_time")
        .in("pet_id", [...petIds])
        .in("status", ["completed", "paid"]);
      if (error) throw error;
      const rows = data ?? [];
      const best = new Map<string, { date: string; time: string }>();
      for (const r of rows) {
        const tk = apptTimeSortKey(r.appointment_time);
        const prev = best.get(r.pet_id);
        if (!prev) {
          best.set(r.pet_id, { date: r.appointment_date, time: tk });
          continue;
        }
        const newer =
          r.appointment_date > prev.date ||
          (r.appointment_date === prev.date && tk > prev.time);
        if (newer) best.set(r.pet_id, { date: r.appointment_date, time: tk });
      }
      const out = new Map<string, string>();
      for (const [pid, v] of best) out.set(pid, v.date);
      return out;
    },
  });
}
