import { supabase } from "@/integrations/supabase/client";

const OWNER_REFERENCE_CHECKS = [
  { table: "bookings" as const, label: "bookings" },
  { table: "invoices" as const, label: "invoices" },
  { table: "wallet_transactions" as const, label: "wallet transactions" },
  { table: "purchase_groups" as const, label: "package purchases" },
  {
    table: "invoice_consolidation_log" as const,
    label: "invoice consolidation history",
  },
  { table: "grooming_appointments" as const, label: "grooming appointments" },
  { table: "daycare_sessions" as const, label: "daycare sessions" },
  { table: "waiting_list" as const, label: "waiting list entries" },
  { table: "agent_conversations" as const, label: "WhatsApp conversations" },
];

const PET_REFERENCE_CHECKS = [
  { table: "booking_pets" as const, label: "boarding bookings" },
  { table: "grooming_appointments" as const, label: "grooming appointments" },
  { table: "daycare_sessions" as const, label: "daycare sessions" },
  { table: "waiting_list" as const, label: "waiting list entries" },
  { table: "feeding_schedules" as const, label: "feeding schedules" },
  { table: "daily_notes" as const, label: "daily notes" },
  { table: "stay_medications" as const, label: "stay medications" },
];

export async function getOwnerDeleteBlockers(ownerId: string): Promise<string[]> {
  const blockers: string[] = [];

  for (const { table, label } of OWNER_REFERENCE_CHECKS) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    if (error) throw error;
    if (count && count > 0) blockers.push(label);
  }

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id")
    .eq("owner_id", ownerId);

  if (petsError) throw petsError;

  const petIds = (pets ?? []).map((pet) => pet.id);
  if (petIds.length === 0) return blockers;

  for (const { table, label } of PET_REFERENCE_CHECKS) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in("pet_id", petIds);

    if (error) throw error;
    if (count && count > 0) blockers.push(label);
  }

  return blockers;
}

export async function getPetDeleteBlockers(petId: string): Promise<string[]> {
  const blockers: string[] = [];

  for (const { table, label } of PET_REFERENCE_CHECKS) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("pet_id", petId);

    if (error) throw error;
    if (count && count > 0) blockers.push(label);
  }

  return blockers;
}

export function formatDeleteBlockedMessage(blockers: string[]): string {
  const unique = [...new Set(blockers)];
  return `This record cannot be deleted because it has existing ${unique.join(", ")}.`;
}
