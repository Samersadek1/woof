import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { createTestOwner, createTestPet } from "../helpers/factories";
import { withScope } from "./_utils";

describe("create_assessment_booking", () => {
  it("creates booking + invoice + booking_pets and updates pet status", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { assessment_status: "not_assessed" });

      const { data, error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: pet.id,
        p_session_date: "2026-06-02",
        p_session_start_time: "10:00",
      });
      if (error) throw error;

      expect(data).toHaveLength(1);
      expect(data[0].amount_aed).toBe(52.5);
      scope.registerResource("bookings", data[0].booking_id);
      scope.registerResource("invoices", data[0].invoice_id);

      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", data[0].booking_id)
        .single();
      expect(booking?.booking_type).toBe("assessment");
      expect(booking?.check_out_date).toBe("2026-06-03");

      const { data: bookingPet } = await supabase
        .from("booking_pets")
        .select("id, pet_id")
        .eq("booking_id", data[0].booking_id)
        .single();
      expect(bookingPet?.pet_id).toBe(pet.id);
      scope.registerResource("booking_pets", bookingPet?.id ?? null);

      const { data: invoiceLine } = await supabase
        .from("invoice_line_items")
        .select("id, service_type, total_price")
        .eq("invoice_id", data[0].invoice_id)
        .single();
      expect(invoiceLine?.service_type).toBe("assessment");
      expect(invoiceLine?.total_price).toBe(52.5);
      scope.registerResource("invoice_line_items", invoiceLine?.id ?? null);

      const { data: petAfter } = await supabase
        .from("pets")
        .select("assessment_status")
        .eq("id", pet.id)
        .single();
      expect(petAfter?.assessment_status).toBe("scheduled");
    });
  });

  it("rejects saturday sessions", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);

      const { error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: pet.id,
        p_session_date: "2026-06-06",
        p_session_start_time: "10:00",
      });
      expect(error?.message ?? "").toContain("Assessment sessions are Mon-Fri only");
    });
  });

  it("rejects sunday sessions", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);

      const { error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: pet.id,
        p_session_date: "2026-06-07",
        p_session_start_time: "10:00",
      });
      expect(error?.message ?? "").toContain("Assessment sessions are Mon-Fri only");
    });
  });

  it("rejects invalid late slot", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);

      const { error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: pet.id,
        p_session_date: "2026-06-02",
        p_session_start_time: "15:00",
      });
      expect(error?.message ?? "").toContain("Assessment slot must be");
    });
  });

  it("rejects invalid early slot", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);

      const { error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: pet.id,
        p_session_date: "2026-06-02",
        p_session_start_time: "09:00",
      });
      expect(error?.message ?? "").toContain("Assessment slot must be");
    });
  });

  it("fails when pet does not exist", async () => {
    await withScope(async () => {
      const supabase = getServiceRoleClient();
      const { error } = await supabase.rpc("create_assessment_booking", {
        p_pet_id: "00000000-0000-0000-0000-000000000000",
        p_session_date: "2026-06-02",
        p_session_start_time: "10:00",
      });
      expect(error?.message ?? "").toContain("Pet");
      expect(error?.message ?? "").toContain("not found");
    });
  });
});
