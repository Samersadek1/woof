import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import {
  createTestBoardingBooking,
  createTestOwner,
  createTestPet,
  createTestRoom,
  createTestInvoice,
} from "../helpers/factories";
import { withScope } from "./_utils";

describe("double occupancy discount RPCs", () => {
  it("calculate returns 0 for single-pet boarding", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const room = await createTestRoom(scope);
      const { booking } = await createTestBoardingBooking(scope, owner.id, room.id, [pet.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });

      const supabase = getServiceRoleClient();
      const { data, error } = await supabase.rpc("calculate_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(data).toBe(0);
    });
  });

  it("calculate returns 30 for 200 subtotal two-pet boarding", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetA` });
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);
      const { booking, invoice } = await createTestBoardingBooking(scope, owner.id, room.id, [petA.id, petB.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });

      const supabase = getServiceRoleClient();
      await supabase
        .from("invoice_line_items")
        .update({ unit_price: 100, quantity: 2, total_price: 200, line_total: 200 })
        .eq("invoice_id", invoice.id);
      await supabase.from("invoices").update({ subtotal: 200, total: 200 }).eq("id", invoice.id);

      const { data, error } = await supabase.rpc("calculate_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(data).toBe(30);
    });
  });

  it("calculate returns 0 for non-boarding booking type", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope);
      const petA = await createTestPet(scope, owner.id);
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          owner_id: owner.id,
          room_id: room.id,
          check_in_date: "2026-07-01",
          check_out_date: "2026-07-02",
          booking_type: "daycare",
          status: "confirmed",
          notes: `${scope.scopeId}_daycare_booking`,
        })
        .select("*")
        .single();
      if (bookingError) throw bookingError;
      scope.registerResource("bookings", booking.id);

      for (const pet of [petA, petB]) {
        const { data: row, error } = await supabase
          .from("booking_pets")
          .insert({ booking_id: booking.id, pet_id: pet.id })
          .select("id")
          .single();
        if (error) throw error;
        scope.registerResource("booking_pets", row.id);
      }

      const { data, error } = await supabase.rpc("calculate_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(data).toBe(0);
    });
  });

  it("calculate returns 0 when booking has no line items", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id);
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          owner_id: owner.id,
          room_id: room.id,
          check_in_date: "2026-07-01",
          check_out_date: "2026-07-03",
          booking_type: "boarding",
          status: "confirmed",
          notes: `${scope.scopeId}_boarding_no_lines`,
        })
        .select("*")
        .single();
      if (bookingError) throw bookingError;
      scope.registerResource("bookings", booking.id);

      for (const pet of [petA, petB]) {
        const { data: row, error } = await supabase
          .from("booking_pets")
          .insert({ booking_id: booking.id, pet_id: pet.id })
          .select("id")
          .single();
        if (error) throw error;
        scope.registerResource("booking_pets", row.id);
      }

      const { data, error } = await supabase.rpc("calculate_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(data).toBe(0);
    });
  });

  it("apply returns null for single-pet booking and creates no adjustment", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id);
      const room = await createTestRoom(scope);
      const { booking } = await createTestBoardingBooking(scope, owner.id, room.id, [pet.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });

      const supabase = getServiceRoleClient();
      const { data, error } = await supabase.rpc("apply_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(data).toBeNull();

      const { data: adjustments } = await supabase
        .from("billing_adjustments")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("adjustment_type", "double_occupancy_discount");
      expect(adjustments ?? []).toHaveLength(0);
    });
  });

  it("apply creates adjustment and updates invoice totals", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetA` });
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);
      const { booking, invoice } = await createTestBoardingBooking(scope, owner.id, room.id, [petA.id, petB.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });

      const supabase = getServiceRoleClient();
      await supabase
        .from("invoice_line_items")
        .update({ unit_price: 100, quantity: 2, total_price: 200, line_total: 200 })
        .eq("invoice_id", invoice.id);
      await supabase.from("invoices").update({ subtotal: 200, total: 200 }).eq("id", invoice.id);

      const { data: adjustmentId, error } = await supabase.rpc("apply_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      if (error) throw error;
      expect(adjustmentId).toBeTruthy();
      scope.registerResource("billing_adjustments", adjustmentId);

      const { data: adjustment } = await supabase
        .from("billing_adjustments")
        .select("adjusted_amount, adjustment_type")
        .eq("id", adjustmentId)
        .single();
      expect(adjustment?.adjustment_type).toBe("double_occupancy_discount");
      expect(adjustment?.adjusted_amount).toBe(-30);

      const { data: invoiceAfter } = await supabase
        .from("invoices")
        .select("discount_amount, total, vat_aed")
        .eq("id", invoice.id)
        .single();
      expect(invoiceAfter?.discount_amount).toBe(30);
      expect(invoiceAfter?.total).toBe(170);
      expect(invoiceAfter?.vat_aed).toBeCloseTo(8.1, 1);
    });
  });

  it("apply is idempotent and does not duplicate adjustments", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id);
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);
      const { booking, invoice } = await createTestBoardingBooking(scope, owner.id, room.id, [petA.id, petB.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });
      const supabase = getServiceRoleClient();
      await supabase
        .from("invoice_line_items")
        .update({ unit_price: 100, quantity: 2, total_price: 200, line_total: 200 })
        .eq("invoice_id", invoice.id);
      await supabase.from("invoices").update({ subtotal: 200, total: 200 }).eq("id", invoice.id);

      const first = await supabase.rpc("apply_double_occupancy_discount", { p_booking_id: booking.id });
      const second = await supabase.rpc("apply_double_occupancy_discount", { p_booking_id: booking.id });
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();

      const { data: adjustments } = await supabase
        .from("billing_adjustments")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("adjustment_type", "double_occupancy_discount");
      expect(adjustments ?? []).toHaveLength(1);
    });
  });

  it("removes existing adjustment when booking no longer qualifies", async () => {
    await withScope(async (scope) => {
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id);
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);
      const { booking, invoice } = await createTestBoardingBooking(scope, owner.id, room.id, [petA.id, petB.id], {
        checkInDate: "2026-07-01",
        checkOutDate: "2026-07-03",
      });
      const supabase = getServiceRoleClient();
      await supabase
        .from("invoice_line_items")
        .update({ unit_price: 100, quantity: 2, total_price: 200, line_total: 200 })
        .eq("invoice_id", invoice.id);
      await supabase.from("invoices").update({ subtotal: 200, total: 200 }).eq("id", invoice.id);
      await supabase.rpc("apply_double_occupancy_discount", { p_booking_id: booking.id });

      await supabase
        .from("booking_pets")
        .delete()
        .eq("booking_id", booking.id)
        .eq("pet_id", petB.id);

      const second = await supabase.rpc("apply_double_occupancy_discount", { p_booking_id: booking.id });
      expect(second.error).toBeNull();
      expect(second.data).toBeNull();

      const { data: adjustments } = await supabase
        .from("billing_adjustments")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("adjustment_type", "double_occupancy_discount");
      expect(adjustments ?? []).toHaveLength(0);

      const { data: invoiceAfter } = await supabase
        .from("invoices")
        .select("total, discount_amount")
        .eq("id", invoice.id)
        .single();
      expect(invoiceAfter?.discount_amount).toBe(0);
      expect(invoiceAfter?.total).toBe(200);
    });
  });

  it("throws when booking has no invoice", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const petA = await createTestPet(scope, owner.id);
      const petB = await createTestPet(scope, owner.id, { name: `${scope.scopeId}_PetB` });
      const room = await createTestRoom(scope);

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          owner_id: owner.id,
          room_id: room.id,
          check_in_date: "2026-07-01",
          check_out_date: "2026-07-03",
          booking_type: "boarding",
          status: "confirmed",
          notes: `${scope.scopeId}_no_invoice`,
        })
        .select("*")
        .single();
      if (bookingError) throw bookingError;
      scope.registerResource("bookings", booking.id);

      for (const pet of [petA, petB]) {
        const { data: row, error } = await supabase
          .from("booking_pets")
          .insert({ booking_id: booking.id, pet_id: pet.id })
          .select("id")
          .single();
        if (error) throw error;
        scope.registerResource("booking_pets", row.id);
      }

      const { data, error } = await supabase.rpc("apply_double_occupancy_discount", {
        p_booking_id: booking.id,
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });
});
