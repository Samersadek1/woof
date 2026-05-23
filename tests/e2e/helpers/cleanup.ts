import { getSupabaseAdminClient } from "./supabaseAdmin";

async function deleteWhereIn(table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const supabase = getSupabaseAdminClient();
  await supabase.from(table).delete().in(column, ids);
}

export async function cleanupTestData(scopePrefix: string) {
  const supabase = getSupabaseAdminClient();

  const { data: owners } = await supabase
    .from("owners")
    .select("id")
    .or(`first_name.ilike.${scopePrefix}%,last_name.ilike.${scopePrefix}%,phone.ilike.${scopePrefix}%`);
  const ownerIds = (owners ?? []).map((row) => row.id as string);

  const { data: pets } = ownerIds.length
    ? await supabase.from("pets").select("id").in("owner_id", ownerIds)
    : { data: [] };
  const petIds = (pets ?? []).map((row) => row.id as string);

  const { data: bookings } = ownerIds.length
    ? await supabase.from("bookings").select("id").in("owner_id", ownerIds)
    : { data: [] };
  const bookingIds = (bookings ?? []).map((row) => row.id as string);

  const { data: invoices } = ownerIds.length
    ? await supabase.from("invoices").select("id").in("owner_id", ownerIds)
    : { data: [] };
  const invoiceIds = (invoices ?? []).map((row) => row.id as string);

  await deleteWhereIn("booking_addons", "booking_id", bookingIds);
  await deleteWhereIn("booking_items", "booking_id", bookingIds);
  await deleteWhereIn("booking_pets", "booking_id", bookingIds);
  await deleteWhereIn("invoice_line_items", "invoice_id", invoiceIds);
  await deleteWhereIn("billing_adjustments", "invoice_id", invoiceIds);
  await deleteWhereIn("billing_adjustments", "booking_id", bookingIds);
  await deleteWhereIn("service_credits", "purchase_group_id", []);
  await deleteWhereIn("service_credits", "pet_id", petIds);
  await deleteWhereIn("purchase_groups", "owner_id", ownerIds);
  await deleteWhereIn("invoices", "id", invoiceIds);
  await deleteWhereIn("bookings", "id", bookingIds);
  await deleteWhereIn("pets", "id", petIds);
  await deleteWhereIn("owners", "id", ownerIds);

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .or(`display_name.ilike.${scopePrefix}%,room_number.ilike.${scopePrefix}%`);
  const roomIds = (rooms ?? []).map((row) => row.id as string);
  await deleteWhereIn("rooms", "id", roomIds);
}
