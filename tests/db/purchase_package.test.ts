import { addMonths, formatISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { createTestOwner, createTestPet } from "../helpers/factories";
import { withScope } from "./_utils";

function isoDate(value: Date): string {
  return formatISO(value, { representation: "date" });
}

function utcToday(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
}

describe("purchase_package", () => {
  it("purchases lucky_7 for one medium pet", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { size: "medium" });

      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "lucky_7",
        p_pet_ids: [pet.id],
        p_payment_method: "card",
      });
      if (error) throw error;

      expect(data).toHaveLength(1);
      expect(data[0].discount_applied_aed).toBe(0);
      expect(data[0].total_amount_aed).toBe(588);
      scope.registerResource("invoices", data[0].invoice_id);
      scope.registerResource("purchase_groups", data[0].purchase_group_id);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("*")
        .eq("purchase_group_id", data[0].purchase_group_id)
        .order("created_at", { ascending: true });
      expect(credits ?? []).toHaveLength(1);
      expect(credits?.[0].service_code).toBe("daycare_full_day");
      expect(credits?.[0].units_total).toBe(7);
      expect(credits?.[0].pet_id).toBe(pet.id);
      scope.registerResource("service_credits", credits?.[0].id ?? null);

      const expectedExpiry = isoDate(addMonths(utcToday(), 2));
      expect(credits?.[0].expires_at).toBe(expectedExpiry);
    });
  });

  it("applies multi-pet discount for six_full_service with two medium pets", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetA`, size: "medium" });
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB`, size: "medium" });

      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "six_full_service",
        p_pet_ids: [petA.id, petB.id],
        p_payment_method: "card",
      });
      if (error) throw error;
      expect(data).toHaveLength(1);
      expect(data[0].discount_applied_aed).toBeCloseTo(236.25, 2);
      expect(data[0].total_amount_aed).toBeCloseTo(2126.25, 2);
      scope.registerResource("invoices", data[0].invoice_id);
      scope.registerResource("purchase_groups", data[0].purchase_group_id);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("*")
        .eq("purchase_group_id", data[0].purchase_group_id);
      expect(credits ?? []).toHaveLength(2);
      expect(new Set((credits ?? []).map((row) => row.pet_id))).toEqual(new Set([petA.id, petB.id]));
      (credits ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const { data: adjustment } = await supabase
        .from("billing_adjustments")
        .select("id, adjustment_type, adjusted_amount")
        .eq("invoice_id", data[0].invoice_id)
        .eq("adjustment_type", "multi_pet_package_discount")
        .single();
      expect(adjustment?.adjusted_amount).toBeCloseTo(-236.25, 2);
      scope.registerResource("billing_adjustments", adjustment?.id ?? null);
    });
  });

  it("supports mixed per-pet package pricing", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const petSmall = await createTestPet(scope, owner.id, {
        name: `${scope.scopeId}_Small`,
        size: "small",
      });
      const petLarge = await createTestPet(scope, owner.id, {
        name: `${scope.scopeId}_Large`,
        size: "large",
      });

      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "six_full_service",
        p_pet_ids: [petSmall.id, petLarge.id],
      });
      if (error) throw error;
      expect(data).toHaveLength(1);
      expect(data[0].discount_applied_aed).toBeCloseTo(236.2, 1);
      expect(data[0].total_amount_aed).toBeCloseTo(2125.8, 1);
      scope.registerResource("invoices", data[0].invoice_id);
      scope.registerResource("purchase_groups", data[0].purchase_group_id);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("id, pet_id, units_total, service_code")
        .eq("purchase_group_id", data[0].purchase_group_id);
      expect(credits ?? []).toHaveLength(2);
      expect((credits ?? []).every((row) => row.service_code === "grooming_full_service")).toBe(true);
      (credits ?? []).forEach((row) => scope.registerResource("service_credits", row.id));
    });
  });

  it("creates thirty_day_ticket base+bonus credits with shared bonus redemption group", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { size: "medium" });

      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "thirty_day_ticket",
        p_pet_ids: [pet.id],
      });
      if (error) throw error;
      scope.registerResource("invoices", data?.[0]?.invoice_id ?? null);
      scope.registerResource("purchase_groups", data?.[0]?.purchase_group_id ?? null);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("*")
        .eq("purchase_group_id", data?.[0]?.purchase_group_id)
        .order("units_total", { ascending: false });
      expect(credits ?? []).toHaveLength(3);
      (credits ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const base = (credits ?? []).find((row) => row.units_total === 30);
      const bonusDaycare = (credits ?? []).find((row) => row.units_total === 1 && row.service_code === "daycare_full_day");
      const bonusSplash = (credits ?? []).find((row) => row.units_total === 1 && row.service_code === "grooming_splash");

      expect(base?.redemption_group_id).toBeNull();
      expect(base?.is_bonus).toBe(false);
      expect(bonusDaycare?.is_bonus).toBe(true);
      expect(bonusSplash?.is_bonus).toBe(true);
      expect(bonusDaycare?.redemption_group_id).toBeTruthy();
      expect(bonusDaycare?.redemption_group_id).toBe(bonusSplash?.redemption_group_id);
    });
  });

  it("throws on empty pet_ids", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const { error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "lucky_7",
        p_pet_ids: [],
      });
      expect(error?.message ?? "").toContain("p_pet_ids must contain at least one pet");
    });
  });

  it("throws on invalid package code", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "not_real_package",
        p_pet_ids: [pet.id],
      });
      expect(error?.message ?? "").toContain("Package");
      expect(error?.message ?? "").toContain("not found");
    });
  });

  it("throws when package requires size and pet has no size", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { size: null });
      const { error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "six_full_service",
        p_pet_ids: [pet.id],
      });
      expect(error?.message ?? "").toContain("requires size-based pricing");
    });
  });

  it("creates purchase_group linked to invoice and owner", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "lucky_7",
        p_pet_ids: [pet.id],
      });
      if (error) throw error;
      const groupId = data?.[0]?.purchase_group_id;
      const invoiceId = data?.[0]?.invoice_id;
      scope.registerResource("purchase_groups", groupId ?? null);
      scope.registerResource("invoices", invoiceId ?? null);

      const { data: pg } = await supabase
        .from("purchase_groups")
        .select("id, owner_id, invoice_id, pet_count")
        .eq("id", groupId)
        .single();
      expect(pg?.owner_id).toBe(owner.id);
      expect(pg?.invoice_id).toBe(invoiceId);
      expect(pg?.pet_count).toBe(1);
    });
  });
});
