#!/usr/bin/env node
/**
 * Bulk apply June 2, 2026 kennel map from staff Excel layout.
 *
 * Usage:
 *   node scripts/apply-kennel-map-2026-06-02.mjs --dry-run
 *   node scripts/apply-kennel-map-2026-06-02.mjs --relocate-blockers
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in .env
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { addDays, format, parseISO } from "date-fns";

dotenv.config();

const MAP_DATE = "2026-06-02";
const DRY_RUN = process.argv.includes("--dry-run");
const RELOCATE_BLOCKERS = process.argv.includes("--relocate-blockers");
const refsArg = (() => {
  const i = process.argv.indexOf("--refs");
  return i >= 0 ? process.argv[i + 1]?.split(",").map((s) => s.trim()) : null;
})();
const STAFF = "script:apply-kennel-map-2026-06-02";
const REASON = "Bulk apply June 2 2026 room map (Excel)";
const OVERFLOW_ROOM_NUMBER = "Overflow 1";

/** [booking_ref, room_number, zone] — from June 2, 2026 room (1).xlsx */
const TARGETS = [
  ["WOOF-2026-00855", "A1", "A"], // Miko Singha
  ["WOOF-2026-00635", "C1", "C"], // Brownie Boeddinghaus
  ["WOOF-2026-00827", "A2", "A"], // Alfie/Peanuts Harris
  ["WOOF-2026-00897", "C2", "C"], // Coco/Polar B
  ["WOOF-2026-01720", "D2", "D"], // Millie/Milo Garland
  ["WOOF-2026-00866", "A3", "A"], // Suki Lloyd
  ["WOOF-2026-00818", "C3", "C"], // Oscar/Rico
  ["WOOF-2026-01382", "D3", "D"], // Ellie/Simba Bury (booking: Ellie only)
  ["WOOF-2026-00654", "A4", "A"], // Snowy Aissa
  ["WOOF-2026-00667", "Dw4", "D"], // Gigi I (w4)
  ["WOOF-2026-00658", "D4", "D"], // Falco A
  ["WOOF-2026-00797", "A5", "A"], // Caffee A
  ["WOOF-2026-00887", "Dw5", "D"], // Bacardi (w5)
  ["WOOF-2026-00612", "D5", "D"], // Pluto P
  ["WOOF-2026-00716", "A6", "A"], // Ollie Naamani
  ["WOOF-2026-00892", "D6", "D"], // Ide B
  ["WOOF-2026-00883", "A7", "A"], // Charlie Lines
  ["WOOF-2026-00939", "C7", "C"], // Enzo Nabavi
  ["WOOF-2026-01728", "D7", "D"], // Lucy/Rio E
  ["WOOF-2026-00810", "A8", "A"], // Cooki Smith
  ["WOOF-2026-00890", "D8", "D"], // Molly Soni Sharma
  ["WOOF-2026-00820", "A9", "A"], // Jj Smallwood
  ["WOOF-2026-00867", "B9", "B"], // Lucy O'Callaghan
  ["WOOF-2026-00904", "C9", "C"], // Pepsi Plassart
  ["WOOF-2026-00737", "D9", "D"], // Chinny/Lily L
  ["WOOF-2026-00923", "A10", "A"], // Kc Jarrar
  ["WOOF-2026-00605", "Dw10", "D"], // Paddy B (w10)
  ["WOOF-2026-00873", "A1", "Daycare 2"], // Toby Imeryuz
  ["WOOF-2026-01401", "A4", "Daycare 2"], // Pedz T
  ["WOOF-2026-00935", "A5", "Daycare 2"], // Romeo Nair
];

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

function roomKey(zone, roomNumber) {
  return `${zone}:${roomNumber}`;
}

function lastNight(checkOutExclusive) {
  return format(addDays(parseISO(checkOutExclusive), -1), "yyyy-MM-dd");
}

function assignmentStart(booking, mapDate) {
  if (booking.check_in_date > mapDate) return booking.check_in_date;
  return mapDate;
}

function dayBefore(isoDate) {
  return format(addDays(parseISO(isoDate), -1), "yyyy-MM-dd");
}

async function loadRooms() {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, room_number, zone")
    .eq("is_active", true)
    .not("size_class", "is", null);
  if (error) throw error;
  const byKey = new Map();
  for (const r of data ?? []) {
    byKey.set(roomKey(r.zone, r.room_number), r.id);
  }
  return byKey;
}

async function loadBookings(refs) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_ref, check_in_date, check_out_date, status, booking_type, do_not_move",
    )
    .in("booking_ref", refs);
  if (error) throw error;
  const byRef = new Map();
  for (const b of data ?? []) byRef.set(b.booking_ref, b);
  return byRef;
}

async function segmentOnDate(bookingId, date) {
  const { data, error } = await supabase
    .from("booking_room_assignments")
    .select("id, room_id, start_date, end_date, rooms(room_number, zone)")
    .eq("booking_id", bookingId)
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadOccupancy(mapDate, bookingIds) {
  const { data, error } = await supabase
    .from("booking_room_assignments")
    .select(
      "booking_id, room_id, bookings!inner(booking_ref, booking_type, status, check_in_date, check_out_date)",
    )
    .lte("start_date", mapDate)
    .gte("end_date", mapDate)
    .in("booking_id", bookingIds);
  if (error) throw error;
  const occ = new Map();
  for (const row of data ?? []) {
    const b = row.bookings;
    if (
      b?.booking_type === "boarding" &&
      (b.status === "confirmed" || b.status === "checked_in") &&
      b.check_in_date <= mapDate &&
      mapDate < b.check_out_date
    ) {
      occ.set(row.room_id, b.booking_ref);
    }
  }
  return occ;
}

async function recordOverride(bookingId, roomId, start, end, warnings) {
  if (DRY_RUN) return;
  await supabase.from("boarding_assignment_overrides").insert({
    booking_id: bookingId,
    room_id: roomId,
    start_date: start,
    end_date: end,
    warnings,
    reason: REASON,
    overridden_by: STAFF,
  });
}

async function clipEndForRoomConflicts(roomId, start, end, excludeBookingId) {
  const { data, error } = await supabase
    .from("booking_room_assignments")
    .select("booking_id, start_date, end_date")
    .eq("room_id", roomId)
    .lte("start_date", end)
    .gte("end_date", start);
  if (error) throw error;
  let clipped = end;
  for (const row of data ?? []) {
    if (row.booking_id === excludeBookingId) continue;
    if (row.start_date > clipped) continue;
    if (row.start_date <= clipped && row.end_date >= start) {
      const candidate = dayBefore(row.start_date);
      if (candidate < clipped) clipped = candidate;
    }
  }
  return clipped;
}

async function relocateBlockersOnMapNight(roomId, mapDate, forBookingRef) {
  if (!RELOCATE_BLOCKERS) return;
  const { data: overflow } = await supabase
    .from("rooms")
    .select("id")
    .eq("room_number", OVERFLOW_ROOM_NUMBER)
    .maybeSingle();
  if (!overflow?.id) throw new Error(`Room ${OVERFLOW_ROOM_NUMBER} not found`);

  const { data: blockers, error } = await supabase
    .from("booking_room_assignments")
    .select("id, booking_id, start_date, end_date, bookings!inner(booking_ref)")
    .eq("room_id", roomId)
    .lte("start_date", mapDate)
    .gte("end_date", mapDate);
  if (error) throw error;

  for (const row of blockers ?? []) {
    if (row.bookings?.booking_ref === forBookingRef) continue;
    const ref = row.bookings?.booking_ref ?? row.booking_id;
    console.log(`  relocate blocker ${ref} off room for ${mapDate}`);
    if (DRY_RUN) continue;
    if (row.start_date < mapDate) {
      await supabase
        .from("booking_room_assignments")
        .update({ end_date: dayBefore(mapDate) })
        .eq("id", row.id);
    } else {
      await supabase.from("booking_room_assignments").delete().eq("id", row.id);
    }
    await supabase.from("booking_room_assignments").insert({
      booking_id: row.booking_id,
      room_id: overflow.id,
      start_date: mapDate,
      end_date: mapDate,
    });
  }
}

async function insertAssignment(booking, roomId, start, end) {
  const { data: validation, error: valErr } = await supabase.rpc(
    "woof_validate_boarding_assignment",
    {
      p_booking_id: booking.id,
      p_start: start,
      p_end: end,
      p_room_id: roomId,
    },
  );
  if (valErr) throw valErr;
  const warnings = validation?.warnings ?? [];
  if (!validation?.ok) {
    await recordOverride(booking.id, roomId, start, end, warnings);
  }
  if (DRY_RUN) {
    console.log(
      `  [dry-run] INSERT ${booking.booking_ref} ${start}→${end} room=${roomId}`,
    );
    return;
  }
  const { error: insErr } = await supabase.from("booking_room_assignments").insert({
    booking_id: booking.id,
    room_id: roomId,
    start_date: start,
    end_date: end,
  });
  if (insErr) throw insErr;
}

async function moveAssignment(booking, roomId, effectiveDate) {
  if (DRY_RUN) {
    console.log(
      `  [dry-run] MOVE ${booking.booking_ref} effective=${effectiveDate} room=${roomId}`,
    );
    return;
  }
  const { error } = await supabase.rpc("move_boarding_room", {
    p_booking_id: booking.id,
    p_effective_date: effectiveDate,
    p_target_room_id: roomId,
    p_reason: REASON,
    p_moved_by: STAFF,
    p_override_do_not_move: true,
  });
  if (error) throw error;
}

async function forceReassignFromMapDate(booking, targetRoomId, mapDate) {
  let end = lastNight(booking.check_out_date);
  const start = assignmentStart(booking, mapDate);
  if (start > end) throw new Error("stay does not cover map date");

  if (RELOCATE_BLOCKERS) {
    await relocateBlockersOnMapNight(targetRoomId, mapDate, booking.booking_ref);
  }
  end = await clipEndForRoomConflicts(targetRoomId, start, end, booking.id);
  if (start > end) throw new Error("target room blocked for entire stay span");

  const { data: segs, error: segErr } = await supabase
    .from("booking_room_assignments")
    .select("id, room_id, start_date, end_date")
    .eq("booking_id", booking.id)
    .order("start_date");
  if (segErr) throw segErr;

  for (const seg of segs ?? []) {
    if (seg.end_date < mapDate) continue;
    if (DRY_RUN) {
      console.log(
        `  [dry-run] clear ${seg.start_date}–${seg.end_date} (room ${seg.room_id})`,
      );
      continue;
    }
    if (seg.start_date < mapDate) {
      const { error } = await supabase
        .from("booking_room_assignments")
        .update({ end_date: dayBefore(mapDate) })
        .eq("id", seg.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("booking_room_assignments")
        .delete()
        .eq("id", seg.id);
      if (error) throw error;
    }
  }

  if (DRY_RUN) {
    console.log(
      `  [dry-run] INSERT ${booking.booking_ref} ${start}→${end} room=${targetRoomId}`,
    );
    return;
  }

  await insertAssignment(booking, targetRoomId, start, end);
}

async function applyOne(booking, targetRoomId, roomLabel, occupancy) {
  const occRef = occupancy.get(targetRoomId);
  if (occRef && occRef !== booking.booking_ref) {
    return { ok: false, reason: `target ${roomLabel} held by ${occRef}` };
  }

  const seg = await segmentOnDate(booking.id, MAP_DATE);
  const currentRoomId = seg?.room_id ?? null;

  const start = assignmentStart(booking, MAP_DATE);
  let end = lastNight(booking.check_out_date);
  if (start > end) {
    return { ok: false, reason: "stay does not cover map date" };
  }

  if (RELOCATE_BLOCKERS) {
    await relocateBlockersOnMapNight(targetRoomId, MAP_DATE, booking.booking_ref);
  }
  end = await clipEndForRoomConflicts(targetRoomId, start, end, booking.id);
  if (start > end) {
    return { ok: false, reason: "target room blocked for entire stay span" };
  }

  if (seg) {
    try {
      await moveAssignment(booking, targetRoomId, MAP_DATE);
    } catch (err) {
      const msg = String(err.message ?? err);
      if (!msg.includes("ROOM_OVERLAP_CONFLICT")) throw err;
      await forceReassignFromMapDate(booking, targetRoomId, MAP_DATE);
    }
  } else {
    await forceReassignFromMapDate(booking, targetRoomId, MAP_DATE);
  }

  if (currentRoomId) {
    const curRef = occupancy.get(currentRoomId);
    if (curRef === booking.booking_ref) occupancy.delete(currentRoomId);
  }
  occupancy.set(targetRoomId, booking.booking_ref);
  return { ok: true, action: seg ? "move" : "insert" };
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Kennel map bulk apply for ${MAP_DATE}`);
  const roomsByKey = await loadRooms();
  const targetList = refsArg
    ? TARGETS.filter(([r]) => refsArg.includes(r))
    : TARGETS;
  const refs = targetList.map(([r]) => r);
  const bookings = await loadBookings(refs);

  const missing = refs.filter((r) => !bookings.has(r));
  if (missing.length) {
    console.error("Missing bookings:", missing.join(", "));
    process.exit(1);
  }

  const unknownRooms = targetList.filter(
    ([, rn, z]) => !roomsByKey.has(roomKey(z, rn)),
  );
  if (unknownRooms.length) {
    console.error(
      "Unknown rooms:",
      unknownRooms.map(([, rn, z]) => `${z}/${rn}`).join(", "),
    );
    process.exit(1);
  }

  const bookingIds = [...bookings.values()].map((b) => b.id);
  const occupancy = await loadOccupancy(MAP_DATE, bookingIds);

  const jobs = await Promise.all(
    targetList.map(async ([ref, roomNumber, zone]) => {
      const booking = bookings.get(ref);
      const seg = booking ? await segmentOnDate(booking.id, MAP_DATE) : null;
      const key = roomKey(zone, roomNumber);
      return {
        ref,
        roomNumber,
        zone,
        roomLabel: `${zone}/${roomNumber}`,
        roomId: roomsByKey.get(key),
        booking,
        hasSegment: !!seg,
        currentRoom: seg?.rooms
          ? `${seg.rooms.zone}/${seg.rooms.room_number}`
          : null,
      };
    }),
  );

  console.log("\nPlanned moves:");
  for (const j of jobs) {
    console.log(
      `  ${j.ref}: ${j.currentRoom ?? "(none)"} → ${j.roomLabel}`,
    );
  }

  const moveJobs = jobs.filter((j) => j.hasSegment);
  const insertJobs = jobs.filter((j) => !j.hasSegment);
  console.log(`\nMoves: ${moveJobs.length}, inserts: ${insertJobs.length}`);

  const results = { ok: 0, skip: 0, fail: 0 };

  async function runQueue(queue, label) {
    let pending = [...queue];
    let pass = 0;
    while (pending.length > 0 && pass < 40) {
      pass += 1;
      const next = [];
      console.log(`\n${label} pass ${pass} (${pending.length} pending)`);
      for (const job of pending) {
        const b = job.booking;
        if (b.status === "cancelled") {
          console.log(`  SKIP ${job.ref} (cancelled)`);
          results.skip += 1;
          continue;
        }
        if (b.booking_type !== "boarding") {
          console.log(`  SKIP ${job.ref} (not boarding)`);
          results.skip += 1;
          continue;
        }
        if (b.check_in_date > MAP_DATE || MAP_DATE >= b.check_out_date) {
          console.log(`  SKIP ${job.ref} (not in-house on ${MAP_DATE})`);
          results.skip += 1;
          continue;
        }

        try {
          const out = await applyOne(b, job.roomId, job.roomLabel, occupancy);
          if (out.ok) {
            console.log(`  OK ${job.ref} → ${job.roomLabel} (${out.action ?? "skip"})`);
            if (out.action === "skip") results.skip += 1;
            else results.ok += 1;
          } else {
            console.log(`  WAIT ${job.ref} → ${job.roomLabel}: ${out.reason}`);
            next.push(job);
          }
        } catch (e) {
          console.log(`  WAIT ${job.ref}: ${e.message}`);
          next.push(job);
        }
      }
      if (next.length === pending.length) {
        console.error(`\nStuck (${label}):`, next.map((j) => j.ref).join(", "));
        results.fail += next.length;
        break;
      }
      pending = next;
    }
  }

  await runQueue(moveJobs, "MOVE");
  await runQueue(insertJobs, "INSERT");

  console.log("\nSummary:", results);
  if (results.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
