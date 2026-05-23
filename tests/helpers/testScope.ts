import { randomBytes } from "node:crypto";
import { getServiceRoleClient } from "./supabaseTestClient";

type ResourceTable =
  | "owners"
  | "pets"
  | "rooms"
  | "bookings"
  | "booking_pets"
  | "booking_addons"
  | "booking_items"
  | "invoices"
  | "invoice_line_items"
  | "billing_adjustments"
  | "purchase_groups"
  | "service_credits";

type ResourceMap = Map<ResourceTable, Set<string>>;

function makeScopeId(): string {
  return `TEST_${Date.now()}_${randomBytes(3).toString("hex")}`;
}

function getTableSet(map: ResourceMap, table: ResourceTable): Set<string> {
  const current = map.get(table);
  if (current) return current;
  const next = new Set<string>();
  map.set(table, next);
  return next;
}

async function safeDelete(table: ResourceTable, ids: Iterable<string>) {
  const idList = [...ids];
  if (idList.length === 0) return;
  const supabase = getServiceRoleClient();
  await supabase.from(table).delete().in("id", idList);
}

async function safeDeleteByColumn(table: ResourceTable, column: string, ids: Iterable<string>) {
  const idList = [...ids];
  if (idList.length === 0) return;
  const supabase = getServiceRoleClient();
  await supabase.from(table).delete().in(column, idList);
}

export function createTestScope() {
  const scopeId = makeScopeId();
  const resourceMap: ResourceMap = new Map();

  function registerResource(table: ResourceTable, id: string | null | undefined) {
    if (!id) return;
    getTableSet(resourceMap, table).add(id);
  }

  async function cleanup() {
    const supabase = getServiceRoleClient();
    const bookingIds = getTableSet(resourceMap, "bookings");
    const invoiceIds = getTableSet(resourceMap, "invoices");

    await safeDelete("booking_addons", getTableSet(resourceMap, "booking_addons"));
    await safeDelete("booking_items", getTableSet(resourceMap, "booking_items"));
    await safeDeleteByColumn("booking_pets", "booking_id", bookingIds);
    await safeDelete("booking_pets", getTableSet(resourceMap, "booking_pets"));
    await safeDeleteByColumn("invoice_line_items", "invoice_id", invoiceIds);
    await safeDelete("invoice_line_items", getTableSet(resourceMap, "invoice_line_items"));
    await safeDeleteByColumn("billing_adjustments", "invoice_id", invoiceIds);
    await safeDeleteByColumn("billing_adjustments", "booking_id", bookingIds);
    await safeDelete("billing_adjustments", getTableSet(resourceMap, "billing_adjustments"));
    await safeDeleteByColumn("service_credits", "purchase_group_id", getTableSet(resourceMap, "purchase_groups"));
    await safeDeleteByColumn("service_credits", "pet_id", getTableSet(resourceMap, "pets"));
    await safeDelete("service_credits", getTableSet(resourceMap, "service_credits"));
    await safeDelete("purchase_groups", getTableSet(resourceMap, "purchase_groups"));
    await safeDelete("invoices", invoiceIds);
    await safeDelete("bookings", bookingIds);
    await safeDelete("pets", getTableSet(resourceMap, "pets"));
    await safeDelete("owners", getTableSet(resourceMap, "owners"));
    await safeDelete("rooms", getTableSet(resourceMap, "rooms"));

    const { data: scopedOwners } = await supabase
      .from("owners")
      .select("id")
      .or(`first_name.ilike.${scopeId}%,last_name.ilike.${scopeId}%,phone.ilike.${scopeId}%`);

    const ownerIds = (scopedOwners ?? []).map((row) => row.id);
    if (ownerIds.length > 0) {
      const { data: scopedPets } = await supabase
        .from("pets")
        .select("id")
        .in("owner_id", ownerIds);
      const petIds = (scopedPets ?? []).map((row) => row.id);

      if (petIds.length > 0) {
        await supabase.from("service_credits").delete().in("pet_id", petIds);
        await supabase.from("booking_pets").delete().in("pet_id", petIds);
        await supabase.from("pets").delete().in("id", petIds);
      }

      const { data: scopedBookings } = await supabase
        .from("bookings")
        .select("id")
        .in("owner_id", ownerIds);
      const bookingIdsFromOwners = (scopedBookings ?? []).map((row) => row.id);
      if (bookingIdsFromOwners.length > 0) {
        await supabase.from("booking_addons").delete().in("booking_id", bookingIdsFromOwners);
        await supabase.from("booking_items").delete().in("booking_id", bookingIdsFromOwners);
        await supabase.from("booking_pets").delete().in("booking_id", bookingIdsFromOwners);
      }

      const { data: scopedInvoices } = await supabase
        .from("invoices")
        .select("id")
        .in("owner_id", ownerIds);
      const invoiceIdsFromOwners = (scopedInvoices ?? []).map((row) => row.id);
      if (invoiceIdsFromOwners.length > 0) {
        await supabase.from("invoice_line_items").delete().in("invoice_id", invoiceIdsFromOwners);
        await supabase.from("billing_adjustments").delete().in("invoice_id", invoiceIdsFromOwners);
      }

      await supabase.from("invoices").delete().in("owner_id", ownerIds);
      await supabase.from("bookings").delete().in("owner_id", ownerIds);
      await supabase.from("purchase_groups").delete().in("owner_id", ownerIds);
      await supabase.from("billing_adjustments").delete().in("owner_id", ownerIds);
      await supabase.from("owners").delete().in("id", ownerIds);
    }
  }

  return {
    scopeId,
    registerResource,
    cleanup,
  };
}
