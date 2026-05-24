import { describe, expect, it } from "vitest";

import { createTestOwner, createTestPet, createTestRoom } from "../helpers/factories";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { withScope } from "./_utils";
import type { Database } from "@/integrations/supabase/types";

async function createTestBooking(args: { ownerId: string; roomId?: string | null; notes: string }) {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      owner_id: args.ownerId,
      room_id: args.roomId ?? null,
      booking_type: "boarding",
      status: "confirmed",
      check_in_date: "2027-06-01",
      check_out_date: "2027-06-03",
      notes: args.notes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

describe("booking_room_assignments", () => {
  it("inserts assignment and reads it back", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_A`, room_number: "A100" });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_assignment_insert`,
      });
      scope.registerResource("bookings", booking.id);

      const { data: inserted, error } = await supabase
        .from("booking_room_assignments")
        .insert({
          booking_id: booking.id,
          room_id: room.id,
          start_date: "2027-06-01",
          end_date: "2027-06-02",
        })
        .select("*")
        .single();
      if (error) throw error;

      const { data: fetched, error: fetchError } = await supabase
        .from("booking_room_assignments")
        .select("*")
        .eq("id", inserted.id)
        .single();
      if (fetchError) throw fetchError;

      expect(fetched.booking_id).toBe(booking.id);
      expect(fetched.room_id).toBe(room.id);
      expect(fetched.start_date).toBe("2027-06-01");
      expect(fetched.end_date).toBe("2027-06-02");
    });
  });

  it("rejects end_date earlier than start_date", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_B`, room_number: "B100" });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_assignment_invalid_dates`,
      });
      scope.registerResource("bookings", booking.id);

      const { error } = await supabase.from("booking_room_assignments").insert({
        booking_id: booking.id,
        room_id: room.id,
        start_date: "2027-06-03",
        end_date: "2027-06-02",
      });

      expect(error?.message ?? "").toContain("booking_room_assignments");
      expect(error?.message ?? "").toContain("check");
    });
  });

  it("cascades assignment deletes when booking is deleted", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_C`, room_number: "C100" });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_assignment_cascade`,
      });
      scope.registerResource("bookings", booking.id);

      const { data: assignment, error: insertError } = await supabase
        .from("booking_room_assignments")
        .insert({
          booking_id: booking.id,
          room_id: room.id,
          start_date: "2027-06-10",
          end_date: "2027-06-12",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error: deleteError } = await supabase.from("bookings").delete().eq("id", booking.id);
      if (deleteError) throw deleteError;

      const { count, error: countError } = await supabase
        .from("booking_room_assignments")
        .select("*", { count: "exact", head: true })
        .eq("id", assignment.id);
      if (countError) throw countError;

      expect(count).toBe(0);
    });
  });

  it("lists assignments by room and date window", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_D`, room_number: "D100" });

      const bookingA = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_range_a`,
      });
      const bookingB = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_range_b`,
      });
      scope.registerResource("bookings", bookingA.id);
      scope.registerResource("bookings", bookingB.id);

      const inserts = await supabase.from("booking_room_assignments").insert([
        {
          booking_id: bookingA.id,
          room_id: room.id,
          start_date: "2027-06-01",
          end_date: "2027-06-02",
        },
        {
          booking_id: bookingB.id,
          room_id: room.id,
          start_date: "2027-06-20",
          end_date: "2027-06-21",
        },
      ]);
      if (inserts.error) throw inserts.error;

      const { data, error } = await supabase
        .from("booking_room_assignments")
        .select("booking_id,start_date,end_date")
        .eq("room_id", room.id)
        .gte("start_date", "2027-06-01")
        .lte("end_date", "2027-06-05");
      if (error) throw error;

      expect(data).toHaveLength(1);
      expect(data[0].booking_id).toBe(bookingA.id);
    });
  });

  it("supports multiple non-overlapping segments for one booking", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_E`, room_number: "E100" });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_multi_segments`,
      });
      scope.registerResource("bookings", booking.id);

      const { error: insertError } = await supabase.from("booking_room_assignments").insert([
        {
          booking_id: booking.id,
          room_id: room.id,
          start_date: "2027-06-01",
          end_date: "2027-06-02",
        },
        {
          booking_id: booking.id,
          room_id: room.id,
          start_date: "2027-06-05",
          end_date: "2027-06-06",
        },
      ]);
      if (insertError) throw insertError;

      const { count, error } = await supabase
        .from("booking_room_assignments")
        .select("*", { count: "exact", head: true })
        .eq("booking_id", booking.id);
      if (error) throw error;

      expect(count).toBe(2);
    });
  });

  it("allows same room across different bookings on different dates", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const room = await createTestRoom(scope, { display_name: `${scope.scopeId}_F`, room_number: "F100" });

      const bookingA = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_same_room_a`,
      });
      const bookingB = await createTestBooking({
        ownerId: owner.id,
        roomId: room.id,
        notes: `${scope.scopeId}_same_room_b`,
      });
      scope.registerResource("bookings", bookingA.id);
      scope.registerResource("bookings", bookingB.id);

      const { error } = await supabase.from("booking_room_assignments").insert([
        {
          booking_id: bookingA.id,
          room_id: room.id,
          start_date: "2027-06-01",
          end_date: "2027-06-02",
        },
        {
          booking_id: bookingB.id,
          room_id: room.id,
          start_date: "2027-06-10",
          end_date: "2027-06-11",
        },
      ]);
      if (error) throw error;

      const { count, error: countError } = await supabase
        .from("booking_room_assignments")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id);
      if (countError) throw countError;

      expect(count).toBe(2);
    });
  });

  it("keeps source-id counts stable when import subset is re-run", async () => {
    const supabase = getServiceRoleClient();

    const before = await Promise.all([
      supabase.from("rooms").select("*", { count: "exact", head: true }).like("source_external_id", "ROOM-%"),
      supabase.from("owners").select("*", { count: "exact", head: true }).like("source_external_id", "CL%"),
      supabase.from("pets").select("*", { count: "exact", head: true }).like("source_external_id", "CL%"),
      supabase.from("bookings").select("*", { count: "exact", head: true }).like("source_external_id", "BOOK-%"),
    ]);

    const payload = {
      rooms_batches: [[{ source_external_id: "ROOM-B2", name: "B2", is_active: true }]],
      owners_batches: [
        [
          {
            source_external_id: "CL000007",
            first_name: "Simon",
            last_name: "Birkebaek",
            phone: "+971554480580",
            email: "birkebaek.simon@bcg.com",
            notes: "Imported 1 pet(s)",
            is_elite: false,
          },
        ],
      ],
      pets_batches: [],
      bookings_batches: [],
      booking_pets_batches: [],
      booking_room_assignments_batches: [],
    };

    const { error: rpcError } = await supabase.rpc("do_legacy_import_atomic", { p_payload: payload });
    if (rpcError) throw rpcError;

    const after = await Promise.all([
      supabase.from("rooms").select("*", { count: "exact", head: true }).like("source_external_id", "ROOM-%"),
      supabase.from("owners").select("*", { count: "exact", head: true }).like("source_external_id", "CL%"),
      supabase.from("pets").select("*", { count: "exact", head: true }).like("source_external_id", "CL%"),
      supabase.from("bookings").select("*", { count: "exact", head: true }).like("source_external_id", "BOOK-%"),
    ]);

    for (let i = 0; i < before.length; i += 1) {
      expect(after[i].count).toBe(before[i].count);
    }
  });

  it("loads pet names and ordered room segments for a multi-night stay", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope);
      const pet = await createTestPet(scope, owner.id, { name: "Paddy" });
      const roomB2 = await createTestRoom(scope, {
        display_name: "B2",
        name: "B2",
        room_number: `${scope.scopeId}_B2`,
      });
      const roomA16 = await createTestRoom(scope, {
        display_name: "A16",
        name: "A16",
        room_number: `${scope.scopeId}_A16`,
      });
      const booking = await createTestBooking({
        ownerId: owner.id,
        roomId: null,
        notes: `${scope.scopeId}_multi_segment_calendar_query`,
      });

      const { error: linkPetError } = await supabase
        .from("booking_pets")
        .insert({ booking_id: booking.id, pet_id: pet.id });
      if (linkPetError) throw linkPetError;

      const { error: segmentsError } = await supabase.from("booking_room_assignments").insert([
        {
          booking_id: booking.id,
          room_id: roomB2.id,
          start_date: "2027-05-23",
          end_date: "2027-05-23",
        },
        {
          booking_id: booking.id,
          room_id: roomA16.id,
          start_date: "2027-05-24",
          end_date: "2027-05-25",
        },
      ]);
      if (segmentsError) throw segmentsError;

      const { data: pets, error: petsError } = await supabase
        .from("booking_pets")
        .select("pets(name)")
        .eq("booking_id", booking.id);
      if (petsError) throw petsError;

      const { data: segments, error: fetchSegmentsError } = await supabase
        .from("booking_room_assignments")
        .select("start_date,end_date,rooms(name)")
        .eq("booking_id", booking.id)
        .order("start_date", { ascending: true });
      if (fetchSegmentsError) throw fetchSegmentsError;

      type BookingPetNameRow = Pick<
        Database["public"]["Tables"]["booking_pets"]["Row"],
        "booking_id"
      > & { pets: Pick<Database["public"]["Tables"]["pets"]["Row"], "name"> | null };
      type RoomSegmentRow = Pick<
        Database["public"]["Tables"]["booking_room_assignments"]["Row"],
        "start_date" | "end_date"
      > & { rooms: Pick<Database["public"]["Tables"]["rooms"]["Row"], "name"> | null };

      const petNames = ((pets ?? []) as BookingPetNameRow[])
        .map((row) => row.pets?.name)
        .filter(Boolean)
        .sort();
      const roomSegments = ((segments ?? []) as RoomSegmentRow[]).map(
        (row) => `${row.rooms?.name} (${row.start_date} to ${row.end_date})`,
      );

      expect(petNames).toEqual(["Paddy"]);
      expect(roomSegments).toEqual([
        "B2 (2027-05-23 to 2027-05-23)",
        "A16 (2027-05-24 to 2027-05-25)",
      ]);
    });
  });
});
