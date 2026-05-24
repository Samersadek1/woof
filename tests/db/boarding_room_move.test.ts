import { describe, expect, it } from "vitest";

import { createTestOwner, createTestRoom } from "../helpers/factories";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { withScope } from "./_utils";
const BOOKING_ROOM_OVERLAP_TOKEN = "ROOM_OVERLAP_CONFLICT";

async function createTestBooking(args: {
  ownerId: string;
  roomId?: string | null;
  notes: string;
  checkIn?: string;
  checkOut?: string;
}) {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      owner_id: args.ownerId,
      room_id: args.roomId ?? null,
      booking_type: "boarding",
      status: "confirmed",
      check_in_date: args.checkIn ?? "2027-07-01",
      check_out_date: args.checkOut ?? "2027-07-05",
      notes: args.notes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

describe("boarding room move + segment integrity", () => {
  it("rejects overlapping segments on the same booking", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_ov`, room_number: "OV100" });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: room.id,
        notes: `${scope.scopeId}_overlap_segments`,
      });
      scope.registerResource("bookings", booking.id);

      const { error } = await supabase.from("booking_room_assignments").insert([
        { booking_id: booking.id, room_id: room.id, start_date: "2027-07-01", end_date: "2027-07-03" },
        { booking_id: booking.id, room_id: room.id, start_date: "2027-07-03", end_date: "2027-07-04" },
      ]);

      expect(error).toBeTruthy();
      expect(error?.message ?? "").toContain("ROOM_OVERLAP_CONFLICT");
    });
  });

  it("move_boarding_room splits segment and updates room_id pointer", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const roomA = await createTestRoom(scope, { display_name: `${scope.scopeId}_A`, room_number: "MV100" });
      const roomB = await createTestRoom(scope, { display_name: `${scope.scopeId}_B`, room_number: "MV200" });
      const checkIn = "2027-08-01";
      const checkOut = "2027-08-05";
      const moveDate = "2027-08-03";
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: roomA.id,
        notes: `${scope.scopeId}_move_rpc`,
        checkIn,
        checkOut,
      });
      scope.registerResource("bookings", booking.id);

      await supabase.from("booking_room_assignments").insert({
        booking_id: booking.id,
        room_id: roomA.id,
        start_date: checkIn,
        end_date: "2027-08-04",
      });

      const { error: moveError } = await supabase.rpc("move_boarding_room", {
        p_booking_id: booking.id,
        p_effective_date: moveDate,
        p_target_room_id: roomB.id,
        p_reason: "Test move",
        p_moved_by: "vitest",
        p_override_do_not_move: false,
      });
      if (moveError) throw moveError;

      const { data: segments, error: segError } = await supabase
        .from("booking_room_assignments")
        .select("start_date,end_date,room_id")
        .eq("booking_id", booking.id)
        .order("start_date");
      if (segError) throw segError;

      expect(segments).toHaveLength(2);
      expect(segments?.[0]).toMatchObject({ start_date: "2027-08-01", end_date: "2027-08-02", room_id: roomA.id });
      expect(segments?.[1]).toMatchObject({ start_date: "2027-08-03", end_date: "2027-08-04", room_id: roomB.id });

      const { data: refreshed, error: bookError } = await supabase
        .from("bookings")
        .select("room_id")
        .eq("id", booking.id)
        .single();
      if (bookError) throw bookError;
      // Future stay: compatibility pointer stays on current segment until move date is reached.
      expect(refreshed.room_id).toBe(roomA.id);

      const { data: onMoveDate } = await supabase
        .from("booking_room_assignments")
        .select("room_id")
        .eq("booking_id", booking.id)
        .lte("start_date", moveDate)
        .gte("end_date", moveDate)
        .single();
      expect(onMoveDate?.room_id).toBe(roomB.id);
    });
  });

  it("blocks cross-owner assignment overlap with ROOM_OVERLAP_CONFLICT", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const ownerA = await createTestOwner(scope);
      const ownerB = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_X`, room_number: "CF100" });
      const bookingA = await createTestBooking({
        ownerId: ownerA.id,
        roomId: room.id,
        notes: `${scope.scopeId}_conflict_a`,
        checkIn: "2027-09-01",
        checkOut: "2027-09-05",
      });
      const bookingB = await createTestBooking({
        ownerId: ownerB.id,
        roomId: null,
        notes: `${scope.scopeId}_conflict_b`,
        checkIn: "2027-09-01",
        checkOut: "2027-09-05",
      });
      scope.registerResource("bookings", bookingA.id);
      scope.registerResource("bookings", bookingB.id);

      await supabase.from("booking_room_assignments").insert({
        booking_id: bookingA.id,
        room_id: room.id,
        start_date: "2027-09-01",
        end_date: "2027-09-04",
      });

      const { error } = await supabase.from("booking_room_assignments").insert({
        booking_id: bookingB.id,
        room_id: room.id,
        start_date: "2027-09-02",
        end_date: "2027-09-04",
      });

      expect(error?.message ?? "").toContain(BOOKING_ROOM_OVERLAP_TOKEN);
    });
  });
});
