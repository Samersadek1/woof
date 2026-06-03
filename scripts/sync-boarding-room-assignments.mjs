#!/usr/bin/env node
/**
 * Align booking_room_assignments with booking stay dates (same rules as boardingRoomAssignmentSync.ts).
 *
 * Usage:
 *   node scripts/sync-boarding-room-assignments.mjs WOOF-2026-00639 WOOF-2026-00798
 *   node scripts/sync-boarding-room-assignments.mjs --all-in-house --date 2026-06-01
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { addDays, format, parseISO } from "date-fns";

dotenv.config();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

function lastNight(checkOutExclusive) {
  return format(addDays(parseISO(checkOutExclusive), -1), "yyyy-MM-dd");
}

function planSync(assignments, checkIn, checkOutExclusive) {
  const last = lastNight(checkOutExclusive);
  const actions = [];
  for (const seg of assignments) {
    if (seg.end_date < checkIn || seg.start_date > last) {
      actions.push({ type: "delete", id: seg.id });
    } else if (seg.end_date > last) {
      actions.push({ type: "update", id: seg.id, end_date: last });
    } else if (seg.start_date < checkIn) {
      actions.push({ type: "update", id: seg.id, start_date: checkIn });
    }
  }
  const deleted = new Set(actions.filter((a) => a.type === "delete").map((a) => a.id));
  const simulated = assignments
    .filter((s) => !deleted.has(s.id))
    .map((s) => {
      let start = s.start_date;
      let end = s.end_date;
      for (const a of actions) {
        if (a.type === "update" && a.id === s.id) {
          if (a.start_date) start = a.start_date;
          if (a.end_date) end = a.end_date;
        }
      }
      return { ...s, start_date: start, end_date: end };
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const lastSeg = simulated[simulated.length - 1];
  const extendLastSegmentTo =
    lastSeg && lastSeg.end_date < last ? last : null;
  return { actions, extendLastSegmentTo };
}

async function syncBooking(booking) {
  const { data: rows, error } = await supabase
    .from("booking_room_assignments")
    .select("id, start_date, end_date")
    .eq("booking_id", booking.id)
    .order("start_date");
  if (error) throw error;
  if (!rows?.length) {
    console.log(`  ${booking.booking_ref}: no segments`);
    return;
  }
  const { actions, extendLastSegmentTo } = planSync(
    rows,
    booking.check_in_date,
    booking.check_out_date,
  );
  for (const action of actions) {
    if (action.type === "delete") {
      const { error: e } = await supabase
        .from("booking_room_assignments")
        .delete()
        .eq("id", action.id);
      if (e) throw e;
    } else {
      const patch = {};
      if (action.start_date) patch.start_date = action.start_date;
      if (action.end_date) patch.end_date = action.end_date;
      const { error: e } = await supabase
        .from("booking_room_assignments")
        .update(patch)
        .eq("id", action.id);
      if (e) throw e;
    }
  }
  if (extendLastSegmentTo) {
    const { data: refreshed } = await supabase
      .from("booking_room_assignments")
      .select("id")
      .eq("booking_id", booking.id)
      .order("start_date");
    const lastId = refreshed?.[refreshed.length - 1]?.id;
    if (lastId) {
      await supabase
        .from("booking_room_assignments")
        .update({ end_date: extendLastSegmentTo })
        .eq("id", lastId);
    }
  }
  console.log(
    `  ${booking.booking_ref}: ${actions.length} action(s)${extendLastSegmentTo ? ", extended" : ""}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const allInHouse = args.includes("--all-in-house");
  const dateIdx = args.indexOf("--date");
  const asOf = dateIdx >= 0 ? args[dateIdx + 1] : null;
  const refs = args.filter((a) => !a.startsWith("--") && a !== asOf);

  let bookings = [];
  if (allInHouse && asOf) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, booking_ref, check_in_date, check_out_date")
      .eq("booking_type", "boarding")
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in_date", asOf)
      .gt("check_out_date", asOf);
    if (error) throw error;
    bookings = data ?? [];
    console.log(`Syncing ${bookings.length} in-house boarding bookings for ${asOf}`);
  } else if (refs.length) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, booking_ref, check_in_date, check_out_date")
      .in("booking_ref", refs);
    if (error) throw error;
    bookings = data ?? [];
  } else {
    console.error(
      "Provide booking refs or: --all-in-house --date YYYY-MM-DD",
    );
    process.exit(1);
  }

  for (const b of bookings) {
    await syncBooking(b);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
