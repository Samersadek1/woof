import { addDays, formatISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { createTestOwner, createTestPet } from "../helpers/factories";
import { withScope } from "./_utils";

function d(daysFromNow: number): string {
  return formatISO(addDays(new Date(), daysFromNow), { representation: "date" });
}

function utcDate(daysFromNow: number): string {
  const nowUtc = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  return formatISO(addDays(nowUtc, daysFromNow), { representation: "date" });
}

describe("list_active_credits_for_pet", () => {
  it("returns empty when pet has no credits", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const supabase = getServiceRoleClient();
      const { data, error } = await supabase.rpc("list_active_credits_for_pet", {
        p_pet_id: pet.id,
      });
      if (error) throw error;
      expect(data ?? []).toHaveLength(0);
    });
  });

  it("returns all active credits", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const supabase = getServiceRoleClient();

      const rows = await supabase
        .from("service_credits")
        .insert([
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            expires_at: d(20),
            source_type: "promotional",
            status: "active",
          },
          {
            pet_id: pet.id,
            service_code: "grooming_full_service",
            units_total: 2,
            expires_at: d(25),
            source_type: "promotional",
            status: "active",
          },
          {
            pet_id: pet.id,
            service_code: "treadmill_daycare_addon",
            units_total: 5,
            expires_at: d(30),
            source_type: "promotional",
            status: "active",
          },
        ])
        .select("id");
      if (rows.error) throw rows.error;
      (rows.data ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data, error } = await supabase.rpc("list_active_credits_for_pet", { p_pet_id: pet.id });
      if (error) throw error;
      expect(data ?? []).toHaveLength(3);
    });
  });

  it("filters out depleted and expired credits", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const supabase = getServiceRoleClient();
      const rows = await supabase
        .from("service_credits")
        .insert([
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            units_consumed: 1,
            expires_at: d(20),
            source_type: "promotional",
            status: "active",
          },
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            units_consumed: 3,
            expires_at: d(20),
            source_type: "promotional",
            status: "depleted",
          },
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            units_consumed: 0,
            expires_at: utcDate(-1),
            source_type: "promotional",
            status: "active",
          },
        ])
        .select("id");
      if (rows.error) throw rows.error;
      (rows.data ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data, error } = await supabase.rpc("list_active_credits_for_pet", { p_pet_id: pet.id });
      if (error) throw error;
      expect(data ?? []).toHaveLength(1);
      expect(data?.[0].units_remaining).toBe(2);
    });
  });

  it("filters by requested service_code", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const supabase = getServiceRoleClient();
      const rows = await supabase
        .from("service_credits")
        .insert([
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            expires_at: d(20),
            source_type: "promotional",
            status: "active",
          },
          {
            pet_id: pet.id,
            service_code: "grooming_full_service",
            units_total: 2,
            expires_at: d(20),
            source_type: "promotional",
            status: "active",
          },
        ])
        .select("id");
      if (rows.error) throw rows.error;
      (rows.data ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data, error } = await supabase.rpc("list_active_credits_for_pet", {
        p_pet_id: pet.id,
        p_service_code: "grooming_full_service",
      });
      if (error) throw error;
      expect(data ?? []).toHaveLength(1);
      expect(data?.[0].service_code).toBe("grooming_full_service");
    });
  });

  it("orders by expires_at asc then bonus desc", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const supabase = getServiceRoleClient();
      const rows = await supabase
        .from("service_credits")
        .insert([
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 3,
            expires_at: d(30),
            source_type: "promotional",
            status: "active",
            is_bonus: false,
          },
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 1,
            expires_at: d(10),
            source_type: "promotional",
            status: "active",
            is_bonus: false,
          },
          {
            pet_id: pet.id,
            service_code: "daycare_full_day",
            units_total: 1,
            expires_at: d(10),
            source_type: "promotional",
            status: "active",
            is_bonus: true,
          },
        ])
        .select("id");
      if (rows.error) throw rows.error;
      (rows.data ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data, error } = await supabase.rpc("list_active_credits_for_pet", { p_pet_id: pet.id });
      if (error) throw error;
      expect(data ?? []).toHaveLength(3);
      expect(data?.[0].is_bonus).toBe(true);
      expect(data?.[1].is_bonus).toBe(false);
      expect(data?.[2].expires_at >= data?.[0].expires_at).toBe(true);
    });
  });

  it("returns package_name via purchase_group join", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { size: "medium" });
      const purchase = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "lucky_7",
        p_pet_ids: [pet.id],
      });
      if (purchase.error) throw purchase.error;
      scope.registerResource("invoices", purchase.data?.[0].invoice_id ?? null);
      scope.registerResource("purchase_groups", purchase.data?.[0].purchase_group_id ?? null);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("id")
        .eq("purchase_group_id", purchase.data?.[0].purchase_group_id);
      (credits ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data, error } = await supabase.rpc("list_active_credits_for_pet", { p_pet_id: pet.id });
      if (error) throw error;
      expect((data ?? []).some((row) => row.package_name === "Lucky 7")).toBe(true);
    });
  });
});
