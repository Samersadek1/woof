#!/usr/bin/env node
/**
 * Match MSH legacy boarding CSV rows to Supabase owners/pets/rooms.
 *
 * Usage:
 *   node scripts/msh-boarding-match.mjs
 *   node scripts/msh-boarding-match.mjs --from 2026-05-01 --to 2026-05-31
 *   node scripts/msh-boarding-match.mjs --csv data/msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv
 *
 * Requires .env: VITE_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

function parseArgs(argv) {
  const args = {
    csv: path.join(
      ROOT,
      "data/msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv",
    ),
    from: null,
    to: null,
    out: path.join(ROOT, "data/msh-boarding-match-report.json"),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--csv" && argv[i + 1]) args.csv = path.resolve(argv[++i]);
    else if (a === "--from" && argv[i + 1]) args.from = argv[++i];
    else if (a === "--to" && argv[i + 1]) args.to = argv[++i];
    else if (a === "--out" && argv[i + 1]) args.out = path.resolve(argv[++i]);
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  const headers = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    if (headers.length === 0) headers.push(...row.map((h) => h.trim()));
    else {
      const obj = {};
      for (let c = 0; c < headers.length; c += 1) {
        obj[headers[c]] = row[c] ?? "";
      }
      rows.push(obj);
    }
    row = [];
  }

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      pushField();
      pushRow();
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  return rows;
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitOwnerName(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function ownerFullName(o) {
  return `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim();
}

function nameScore(csvName, owner) {
  const csv = norm(csvName);
  const full = norm(ownerFullName(owner));
  const rev = norm(`${owner.last_name ?? ""} ${owner.first_name ?? ""}`);
  const { first, last } = splitOwnerName(csvName);
  const csvFirstLast = norm(`${first} ${last}`);
  if (!csv || !full) return 0;
  if (csv === full || csv === rev || csv === csvFirstLast) return 100;
  if (full.startsWith(csv) || csv.startsWith(full)) return 85;
  if (full.includes(csv) || csv.includes(full)) return 70;
  const csvParts = csv.split(" ").filter(Boolean);
  const ownerParts = full.split(" ").filter(Boolean);
  const overlap = csvParts.filter((p) => ownerParts.includes(p)).length;
  if (overlap >= 2 && overlap >= Math.min(csvParts.length, ownerParts.length) - 1) {
    return 60 + overlap * 5;
  }
  if (overlap >= 1 && csvParts.length === 1) return 45;
  return 0;
}

function petScore(csvPet, pets) {
  const want = norm(csvPet);
  if (!want) return { score: 0, pet: null };
  const exact = pets.find((p) => norm(p.name) === want);
  if (exact) return { score: 100, pet: exact };
  const partial = pets.find(
    (p) => norm(p.name).includes(want) || want.includes(norm(p.name)),
  );
  if (partial) return { score: 75, pet: partial };
  return { score: 0, pet: null };
}

function stayOverlapsWindow(stay, from, to) {
  if (!from && !to) return true;
  const s = stay.start_date;
  const e = stay.end_date;
  if (from && e < from) return false;
  if (to && s > to) return false;
  return true;
}

function suggestRooms(calendarRoom, rooms) {
  const raw = norm(calendarRoom);
  const isCat =
    raw.includes("cattery") ||
    raw.includes("cat ") ||
    raw.endsWith(" cat");
  const pool = rooms.filter((r) =>
    isCat ? r.wing === "cattery" : r.wing !== "cattery",
  );

  const hints = [];
  if (raw.includes("presidential")) hints.push("presidential", "super_presidential");
  if (raw.includes("royal")) hints.push("royal");
  if (raw.includes("deluxe")) hints.push("deluxe");
  if (raw.includes("standard")) hints.push("standard");
  if (raw.includes("family")) hints.push("family");
  if (raw.includes("fleet")) hints.push("fleet");
  if (raw.includes("single")) hints.push("single");
  if (raw.includes("double") || raw.includes("twin")) hints.push("double", "twin");

  const scored = pool
    .map((r) => {
      const dn = norm(r.display_name);
      const rt = norm(r.room_type ?? "");
      const pc = norm(r.pricing_category ?? "");
      let score = 0;
      for (const h of hints) {
        if (dn.includes(h) || rt.includes(h) || pc.includes(h)) score += 10;
      }
      if (raw && (dn.includes(raw) || raw.includes(dn))) score += 25;
      return { room: r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((x) => ({
    id: x.room.id,
    display_name: x.room.display_name,
    wing: x.room.wing,
    room_type: x.room.room_type,
    score: x.score,
  }));
}

function bookingKey(ownerId, petId, checkIn, checkOut, roomId) {
  return `${ownerId}|${petId}|${checkIn}|${checkOut}|${roomId ?? ""}`;
}

function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "Missing Supabase credentials. Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or service role) in .env",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const csvText = readFileSync(args.csv, "utf8");
  const nightRows = parseCsv(csvText);

  const stayMap = new Map();
  for (const row of nightRows) {
    const key = [
      row.owner_name,
      row.pet_name,
      row.start_date,
      row.end_date,
      row.calendar_room,
      row.boarding_area,
    ].join("\0");
    if (!stayMap.has(key)) {
      stayMap.set(key, {
        owner_name: row.owner_name,
        pet_name: row.pet_name,
        start_date: row.start_date,
        end_date: row.end_date,
        calendar_room: row.calendar_room,
        boarding_area: row.boarding_area,
        branch_site: row.branch_site,
        calendar_raw: row.calendar_raw,
        room_review_flag: row.room_review_flag,
        night_count: 0,
      });
    }
    stayMap.get(key).night_count += 1;
  }

  let stays = [...stayMap.values()];
  if (args.from || args.to) {
    stays = stays.filter((s) => stayOverlapsWindow(s, args.from, args.to));
  }

  const [{ data: owners, error: oErr }, { data: rooms, error: rErr }, { data: bookings, error: bErr }] =
    await Promise.all([
      supabase.from("owners").select("id, first_name, last_name, phone, member_type, pets(id, name, species, breed)"),
      supabase.from("rooms").select("id, display_name, wing, room_type, pricing_category, is_active").eq("is_active", true),
      supabase
        .from("bookings")
        .select("id, owner_id, room_id, check_in_date, check_out_date, status, booking_type, booking_pets(pet_id)")
        .eq("booking_type", "boarding")
        .neq("status", "cancelled"),
    ]);

  if (oErr) throw oErr;
  if (rErr) throw rErr;
  if (bErr) throw bErr;

  if ((owners ?? []).length === 0) {
    console.warn(
      "\n⚠️  Loaded 0 owners — RLS likely blocked the anon/publishable key.",
    );
    console.warn(
      "   Log into the admin app and use Boarding → Calendar import, or add SUPABASE_SERVICE_ROLE_KEY to .env\n",
    );
  }

  const existingByPet = new Map();
  for (const b of bookings ?? []) {
    const petIds = (b.booking_pets ?? []).map((bp) => bp.pet_id);
    for (const petId of petIds) {
      const k = bookingKey(b.owner_id, petId, b.check_in_date, b.check_out_date, b.room_id);
      existingByPet.set(k, b);
    }
  }

  const results = [];
  const summary = {
    generated_at: new Date().toISOString(),
    csv: args.csv,
    date_filter: { from: args.from, to: args.to },
    total_stays: stays.length,
    ready: 0,
    owner_only: 0,
    owner_ambiguous: 0,
    no_owner: 0,
    already_in_db: 0,
    room_needs_review: 0,
    long_stay_skipped: 0,
  };

  const LONG_NIGHT_THRESHOLD = 120;

  for (const stay of stays.sort((a, b) =>
    `${a.start_date}${a.owner_name}`.localeCompare(`${b.start_date}${b.owner_name}`),
  )) {
    const ownerCandidates = (owners ?? [])
      .map((o) => ({ owner: o, score: nameScore(stay.owner_name, o) }))
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score);

    const top = ownerCandidates[0];
    const second = ownerCandidates[1];
    const ambiguous =
      top && second && top.score >= 60 && second.score >= 60 && top.score - second.score < 15;

    let match_status = "no_owner";
    let owner_id = null;
    let owner_db_name = null;
    let owner_match_score = 0;
    let pet_id = null;
    let pet_match_score = 0;

    if (top && top.score >= 60 && !ambiguous) {
      owner_id = top.owner.id;
      owner_db_name = ownerFullName(top.owner);
      owner_match_score = top.score;
      const pets = top.owner.pets ?? [];
      const ps = petScore(stay.pet_name, pets);
      pet_match_score = ps.score;
      pet_id = ps.pet?.id ?? null;
      if (pet_id) match_status = "ready";
      else match_status = "owner_only";
    } else if (ambiguous) {
      match_status = "owner_ambiguous";
    } else if (top && top.score >= 40) {
      match_status = "owner_weak";
      owner_id = top.owner.id;
      owner_db_name = ownerFullName(top.owner);
      owner_match_score = top.score;
    }

    const roomSuggestions = suggestRooms(stay.calendar_room, rooms ?? []);
    const room_needs_review =
      !!stay.room_review_flag ||
      roomSuggestions.length === 0 ||
      (stay.calendar_room ?? "").length > 60;

    const existing =
      owner_id && pet_id
        ? [...existingByPet.entries()].find(([k, b]) => {
            const [, p, cin, cout] = k.split("|");
            return (
              p === pet_id &&
              b.owner_id === owner_id &&
              datesOverlap(stay.start_date, stay.end_date, cin, cout)
            );
          })?.[1]
        : null;

    if (existing) {
      match_status = "already_in_db";
      summary.already_in_db += 1;
    } else if (match_status === "ready") summary.ready += 1;
    else if (match_status === "owner_only") summary.owner_only += 1;
    else if (match_status === "owner_ambiguous") summary.owner_ambiguous += 1;
    else if (match_status === "no_owner" || match_status === "owner_weak") summary.no_owner += 1;

    if (room_needs_review) summary.room_needs_review += 1;
    if (stay.night_count > LONG_NIGHT_THRESHOLD) summary.long_stay_skipped += 1;

    results.push({
      ...stay,
      match_status,
      owner_id,
      owner_db_name,
      owner_match_score,
      owner_alternatives: ownerCandidates.slice(0, 3).map((c) => ({
        id: c.owner.id,
        name: ownerFullName(c.owner),
        score: c.score,
        phone: c.owner.phone,
      })),
      pet_id,
      pet_match_score,
      room_suggestions: roomSuggestions,
      room_needs_review,
      existing_booking_id: existing?.id ?? null,
      importable:
        match_status === "ready" &&
        !existing &&
        roomSuggestions.length > 0 &&
        stay.night_count <= LONG_NIGHT_THRESHOLD,
    });
  }

  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(
    args.out,
    JSON.stringify({ summary, stays: results }, null, 2),
    "utf8",
  );

  const csvOut = args.out.replace(/\.json$/, ".csv");
  const csvHeader = [
    "match_status",
    "importable",
    "owner_name",
    "pet_name",
    "start_date",
    "end_date",
    "calendar_room",
    "owner_db_name",
    "owner_match_score",
    "pet_match_score",
    "room_needs_review",
    "existing_booking_id",
    "night_count",
    "calendar_raw",
  ].join(",");
  const csvLines = results.map((r) =>
    [
      r.match_status,
      r.importable ? "yes" : "no",
      r.owner_name,
      r.pet_name,
      r.start_date,
      r.end_date,
      r.calendar_room,
      r.owner_db_name ?? "",
      r.owner_match_score,
      r.pet_match_score,
      r.room_needs_review ? "yes" : "no",
      r.existing_booking_id ?? "",
      r.night_count,
      (r.calendar_raw ?? "").replace(/"/g, '""'),
    ]
      .map((v) => `"${String(v)}"`)
      .join(","),
  );
  writeFileSync(csvOut, [csvHeader, ...csvLines].join("\n"), "utf8");

  console.log("\nMSH Boarding match report");
  console.log("CSV:", args.csv);
  if (args.from || args.to) {
    console.log("Date filter:", args.from ?? "…", "→", args.to ?? "…");
  }
  console.log("Stays analyzed:", summary.total_stays);
  console.log("  Ready (owner + pet):", summary.ready);
  console.log("  Owner matched, pet missing:", summary.owner_only);
  console.log("  Ambiguous owner:", summary.owner_ambiguous);
  console.log("  No / weak owner match:", summary.no_owner);
  console.log("  Already in DB (overlap):", summary.already_in_db);
  console.log("  Room needs review:", summary.room_needs_review);
  console.log("  Long stays (>", LONG_NIGHT_THRESHOLD, " nights in CSV window):", summary.long_stay_skipped);
  console.log("\nWrote:", args.out);
  console.log("Wrote:", csvOut);

  const samples = {
    ready: results.filter((r) => r.importable).slice(0, 5),
    owner_only: results.filter((r) => r.match_status === "owner_only").slice(0, 5),
    no_owner: results.filter((r) => r.match_status === "no_owner").slice(0, 5),
  };
  for (const [label, list] of Object.entries(samples)) {
    if (!list.length) continue;
    console.log(`\n--- ${label} (sample) ---`);
    for (const r of list) {
      console.log(
        `  ${r.owner_name} / ${r.pet_name} ${r.start_date}→${r.end_date} → ${r.owner_db_name ?? "?"} (${r.match_status})`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
