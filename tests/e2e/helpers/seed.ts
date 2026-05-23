import { addDays, format } from "date-fns";
import { getSupabaseAdminClient } from "./supabaseAdmin";

export async function seedOwner(scopePrefix: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("owners")
    .insert({
      first_name: `${scopePrefix}_Owner`,
      last_name: "QA",
      phone: `${scopePrefix}_Phone`,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function seedPet(
  ownerId: string,
  name: string,
  overrides: Record<string, unknown> = {},
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("pets")
    .insert({
      owner_id: ownerId,
      name,
      species: "dog",
      size: "medium",
      coat_type: "short",
      assessment_status: "passed",
      ...overrides,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function seedRoom(scopePrefix: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      display_name: `${scopePrefix}_Room`,
      room_number: scopePrefix.slice(-6),
      room_type: "kennels",
      wing: "back_kennels",
      capacity_type: "single",
      max_pets: 2,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function seedDaycareCredit(
  petId: string,
  purchaseGroupId: string | null,
  unitsTotal: number,
) {
  const supabase = getSupabaseAdminClient();
  const today = new Date();
  const expires = format(addDays(today, 30), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("service_credits")
    .insert({
      pet_id: petId,
      purchase_group_id: purchaseGroupId,
      service_code: "daycare_full_day",
      units_total: unitsTotal,
      units_consumed: 0,
      status: "active",
      expires_at: expires,
      source_type: "promotional",
      is_bonus: false,
      redemption_group_id: null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
