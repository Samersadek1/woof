import { addDays, formatISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { createTestOwner, createTestPet } from "../helpers/factories";
import { withScope } from "./_utils";

function dateOnly(value: Date): string {
  return formatISO(value, { representation: "date" });
}

describe("consume_service_credit", () => {
  it("consumes one unit from active multi-unit credit", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data: credit, error } = await supabase
        .from("service_credits")
        .insert({
          pet_id: pet.id,
          service_code: "daycare_full_day",
          units_total: 7,
          units_consumed: 0,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      scope.registerResource("service_credits", credit.id);

      const consumed = await supabase.rpc("consume_service_credit", {
        p_credit_id: credit.id,
        p_units: 1,
      });
      expect(consumed.error).toBeNull();
      expect(consumed.data?.[0].units_remaining).toBe(6);
      expect(consumed.data?.[0].new_status).toBe("active");
    });
  });

  it("depletes one-unit credit", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data: credit } = await supabase
        .from("service_credits")
        .insert({
          pet_id: pet.id,
          service_code: "daycare_full_day",
          units_total: 1,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", credit?.id ?? null);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: credit!.id,
        p_units: 1,
      });
      expect(result.error).toBeNull();
      expect(result.data?.[0].new_status).toBe("depleted");
    });
  });

  it("rejects consumption above remaining units", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data: credit } = await supabase
        .from("service_credits")
        .insert({
          pet_id: pet.id,
          service_code: "daycare_full_day",
          units_total: 2,
          units_consumed: 1,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", credit?.id ?? null);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: credit!.id,
        p_units: 2,
      });
      expect(result.error?.message ?? "").toContain("Insufficient units");
    });
  });

  it("rejects already depleted credit", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data: credit } = await supabase
        .from("service_credits")
        .insert({
          pet_id: pet.id,
          service_code: "daycare_full_day",
          units_total: 1,
          units_consumed: 1,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "depleted",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", credit?.id ?? null);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: credit!.id,
        p_units: 1,
      });
      expect(result.error?.message ?? "").toContain("Credit not active");
    });
  });

  it("throws on expired credit", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const { data: credit } = await supabase
        .from("service_credits")
        .insert({
          pet_id: pet.id,
          service_code: "daycare_full_day",
          units_total: 2,
          units_consumed: 0,
          expires_at: dateOnly(addDays(new Date(), -5)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", credit?.id ?? null);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: credit!.id,
        p_units: 1,
      });
      expect(result.error?.message ?? "").toContain("Credit expired");

      // Note: status is NOT updated to 'expired' on access — see
      // consume_service_credit comment. list_active_credits_for_pet filters by
      // expires_at so callers don't see it as active.
      const { data: refreshed } = await supabase
        .from("service_credits")
        .select("status")
        .eq("id", credit!.id)
        .single();
      expect(refreshed?.status).toBe("active");
    });
  });

  it("consuming bonus credit revokes sibling in same redemption group", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { size: "medium" });

      const purchase = await supabase.rpc("purchase_package", {
        p_owner_id: owner.id,
        p_package_code: "thirty_day_ticket",
        p_pet_ids: [pet.id],
      });
      if (purchase.error) throw purchase.error;
      scope.registerResource("purchase_groups", purchase.data?.[0].purchase_group_id ?? null);
      scope.registerResource("invoices", purchase.data?.[0].invoice_id ?? null);

      const { data: credits } = await supabase
        .from("service_credits")
        .select("*")
        .eq("purchase_group_id", purchase.data?.[0].purchase_group_id);
      (credits ?? []).forEach((row) => scope.registerResource("service_credits", row.id));

      const bonusDaycare = (credits ?? []).find((row) => row.is_bonus && row.service_code === "daycare_full_day");
      const bonusSplash = (credits ?? []).find((row) => row.is_bonus && row.service_code === "grooming_splash");
      const base = (credits ?? []).find((row) => !row.is_bonus);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: bonusDaycare!.id,
        p_units: 1,
      });
      expect(result.error).toBeNull();

      const { data: afterBonus } = await supabase
        .from("service_credits")
        .select("id, status")
        .in("id", [bonusDaycare!.id, bonusSplash!.id, base!.id]);
      const byId = new Map((afterBonus ?? []).map((row) => [row.id, row.status]));
      expect(byId.get(bonusDaycare!.id)).toBe("depleted");
      expect(byId.get(bonusSplash!.id)).toBe("revoked");
      expect(byId.get(base!.id)).toBe("active");
    });
  });

  it("consuming non-grouped credit has no sibling side effects", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetA` });
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });

      const { data: creditA } = await supabase
        .from("service_credits")
        .insert({
          pet_id: petA.id,
          service_code: "daycare_full_day",
          units_total: 2,
          units_consumed: 0,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", creditA?.id ?? null);

      const { data: creditB } = await supabase
        .from("service_credits")
        .insert({
          pet_id: petB.id,
          service_code: "daycare_full_day",
          units_total: 2,
          units_consumed: 0,
          expires_at: dateOnly(addDays(new Date(), 30)),
          source_type: "promotional",
          status: "active",
        })
        .select("*")
        .single();
      scope.registerResource("service_credits", creditB?.id ?? null);

      const result = await supabase.rpc("consume_service_credit", {
        p_credit_id: creditA!.id,
        p_units: 1,
      });
      expect(result.error).toBeNull();

      const { data: after } = await supabase
        .from("service_credits")
        .select("id, status, units_consumed")
        .in("id", [creditA!.id, creditB!.id]);
      const byId = new Map((after ?? []).map((row) => [row.id, row]));
      expect(byId.get(creditA!.id)?.units_consumed).toBe(1);
      expect(byId.get(creditA!.id)?.status).toBe("active");
      expect(byId.get(creditB!.id)?.units_consumed).toBe(0);
      expect(byId.get(creditB!.id)?.status).toBe("active");
    });
  });
});
