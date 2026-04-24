import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParkSlotItem, ScheduleItem, TodaySchedule } from "@/types/dashboard";

function ownerName(firstName?: string | null, lastName?: string | null) {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || "Unknown owner";
}

function ownerInitials(firstName?: string | null, lastName?: string | null) {
  const a = firstName?.[0] ?? "";
  const b = lastName?.[0] ?? "";
  return (a + b || "?").toUpperCase();
}

function toScheduleItem(row: any): ScheduleItem {
  const firstPet = row.booking_pets?.[0];
  return {
    bookingId: row.id,
    petId: firstPet?.pet_id ?? null,
    ownerId: row.owner_id,
    petName: firstPet?.pets?.name ?? "Unknown pet",
    ownerName: ownerName(row.owners?.first_name, row.owners?.last_name),
    roomNumber: row.rooms?.room_number ?? null,
    time: row.actual_check_in_at ?? row.actual_check_out_at ?? null,
    sortKey: firstPet?.pets?.name?.toLowerCase?.() ?? "zzzz",
  };
}

function byTimeThenAlpha(a: ScheduleItem, b: ScheduleItem) {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.sortKey.localeCompare(b.sortKey);
}

export function useTodaySchedule(asOf: string) {
  return useQuery({
    queryKey: ["today-schedule", asOf],
    queryFn: async () => {
      const [bookingsRes, groomingRes, parkRes] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id, owner_id, booking_type, check_in_date, check_out_date, actual_check_in_at, actual_check_out_at, rooms(room_number), owners(first_name, last_name), booking_pets(pet_id, pets(name))",
          )
          .in("booking_type", ["boarding", "daycare"])
          .or(`check_in_date.eq.${asOf},check_out_date.eq.${asOf}`)
          .neq("status", "cancelled"),
        supabase
          .from("grooming_appointments")
          .select("id, pet_id, owner_id, appointment_time, pets(name), owners(first_name, last_name)")
          .eq("appointment_date", asOf)
          .neq("status", "cancelled")
          .order("appointment_time", { ascending: true, nullsFirst: false }),
        supabase
          .from("park_bookings")
          .select("id, slot_start, slot_end, size_lane, is_assessment, pet_id, owner_id, pets(name), owners(first_name, last_name)")
          .eq("visit_date", asOf)
          .order("slot_start", { ascending: true }),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (groomingRes.error) throw groomingRes.error;
      if (parkRes.error) throw parkRes.error;

      const bookings = bookingsRes.data ?? [];
      const grooming = groomingRes.data ?? [];
      const park = (parkRes.data ?? []) as any[];

      const checkIns = bookings
        .filter((b) => b.booking_type === "boarding" && b.check_in_date === asOf)
        .map(toScheduleItem)
        .sort(byTimeThenAlpha);

      const checkOuts = bookings
        .filter((b) => b.booking_type === "boarding" && b.check_out_date === asOf)
        .map(toScheduleItem)
        .sort(byTimeThenAlpha);

      const daycare = bookings
        .filter((b) => b.booking_type === "daycare" && b.check_in_date === asOf)
        .map(toScheduleItem)
        .sort(byTimeThenAlpha);

      const groomingRows: ScheduleItem[] = grooming.map((g: any) => ({
        bookingId: g.id,
        petId: g.pet_id,
        ownerId: g.owner_id,
        petName: g.pets?.name ?? "Unknown pet",
        ownerName: ownerName(g.owners?.first_name, g.owners?.last_name),
        roomNumber: null,
        time: g.appointment_time,
        sortKey: g.appointment_time ?? g.pets?.name?.toLowerCase?.() ?? "zzzz",
      }));

      const parkRows: ParkSlotItem[] = park.map((p) => ({
        id: p.id,
        slotStart: p.slot_start,
        slotEnd: p.slot_end,
        sizeLane: p.size_lane,
        isAssessment: Boolean(p.is_assessment),
        petId: p.pet_id ?? null,
        ownerId: p.owner_id ?? null,
        petName: p.pets?.name ?? "Walk-in",
        ownerInitials: ownerInitials(p.owners?.first_name, p.owners?.last_name),
      }));

      return {
        check_ins: checkIns,
        check_outs: checkOuts,
        daycare,
        park: parkRows.filter((p) => !p.isAssessment),
        grooming: groomingRows,
        assessments: parkRows.filter((p) => p.isAssessment),
      } satisfies TodaySchedule;
    },
  });
}
