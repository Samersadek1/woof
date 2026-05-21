import type { Database } from "@/integrations/supabase/types";

export type MshBoardingNightRow = {
  night_date: string;
  weekday: string;
  owner_name: string;
  pet_name: string;
  start_date: string;
  end_date: string;
  branch_site: string;
  boarding_area: string;
  calendar_room: string;
  source_page: string;
  room_review_flag: string;
  calendar_raw: string;
};

export type MshBoardingStay = {
  owner_name: string;
  pet_name: string;
  start_date: string;
  end_date: string;
  calendar_room: string;
  boarding_area: string;
  branch_site: string;
  calendar_raw: string;
  room_review_flag: string;
  night_count: number;
};

type OwnerRow = Pick<
  Database["public"]["Tables"]["owners"]["Row"],
  "id" | "first_name" | "last_name" | "phone"
>;
type PetRow = Pick<
  Database["public"]["Tables"]["pets"]["Row"],
  "id" | "name" | "species" | "owner_id"
>;
type RoomRow = Pick<
  Database["public"]["Tables"]["rooms"]["Row"],
  "id" | "display_name" | "wing" | "room_type" | "pricing_category" | "is_active"
>;

export type OwnerWithPetsIndex = OwnerRow & { pets: PetRow[] };

export type MshMatchStatus =
  | "ready"
  | "owner_only"
  | "owner_ambiguous"
  | "owner_weak"
  | "no_owner"
  | "already_in_db";

export type MshStayMatch = MshBoardingStay & {
  match_status: MshMatchStatus;
  owner_id: string | null;
  owner_db_name: string | null;
  owner_match_score: number;
  owner_alternatives: { id: string; name: string; score: number; phone: string | null }[];
  pet_id: string | null;
  pet_match_score: number;
  pet_alternatives: { id: string; name: string; score: number }[];
  room_suggestions: {
    id: string;
    display_name: string;
    wing: string;
    room_type: string | null;
    score: number;
  }[];
  room_needs_review: boolean;
  existing_booking_id: string | null;
  importable: boolean;
};

export const MSH_BOARDING_CSV_PATH =
  "/data/msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv";

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitOwnerName(raw: string) {
  const t = raw.trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function ownerFullName(o: OwnerRow): string {
  return `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim();
}

function nameScore(csvName: string, owner: OwnerRow): number {
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

function petScores(csvPet: string, pets: PetRow[]) {
  const want = norm(csvPet);
  if (!want) return [];
  return pets
    .map((p) => {
      const pn = norm(p.name);
      if (pn === want) return { pet: p, score: 100 };
      if (pn.includes(want) || want.includes(pn)) return { pet: p, score: 75 };
      return { pet: p, score: 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function parseMshBoardingCsv(text: string): MshBoardingNightRow[] {
  const rows: MshBoardingNightRow[] = [];
  let i = 0;
  const len = text.length;
  const headers: string[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    if (headers.length === 0) headers.push(...row.map((h) => h.trim()));
    else {
      const obj = {} as Record<string, string>;
      for (let c = 0; c < headers.length; c += 1) obj[headers[c]] = row[c] ?? "";
      rows.push(obj as MshBoardingNightRow);
    }
    row = [];
  };

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

export function aggregateMshStays(nightRows: MshBoardingNightRow[]): MshBoardingStay[] {
  const stayMap = new Map<string, MshBoardingStay>();
  for (const row of nightRows) {
    const key = [
      row.owner_name,
      row.pet_name,
      row.start_date,
      row.end_date,
      row.calendar_room,
      row.boarding_area,
    ].join("\0");
    const existing = stayMap.get(key);
    if (existing) existing.night_count += 1;
    else {
      stayMap.set(key, {
        owner_name: row.owner_name,
        pet_name: row.pet_name,
        start_date: row.start_date,
        end_date: row.end_date,
        calendar_room: row.calendar_room,
        boarding_area: row.boarding_area,
        branch_site: row.branch_site,
        calendar_raw: row.calendar_raw,
        room_review_flag: row.room_review_flag ?? "",
        night_count: 1,
      });
    }
  }
  return [...stayMap.values()];
}

export function stayOverlapsWindow(
  stay: Pick<MshBoardingStay, "start_date" | "end_date">,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (from && stay.end_date < from) return false;
  if (to && stay.start_date > to) return false;
  return true;
}

export function suggestRooms(calendarRoom: string, rooms: RoomRow[]) {
  const raw = norm(calendarRoom);
  const isCat =
    raw.includes("cattery") || raw.includes("cat ") || raw.endsWith(" cat");
  const pool = rooms.filter((r) =>
    r.is_active ? (isCat ? r.wing === "cattery" : r.wing !== "cattery") : false,
  );

  const hints: string[] = [];
  if (raw.includes("presidential")) hints.push("presidential", "super_presidential");
  if (raw.includes("royal")) hints.push("royal");
  if (raw.includes("deluxe")) hints.push("deluxe");
  if (raw.includes("standard")) hints.push("standard");
  if (raw.includes("family")) hints.push("family");
  if (raw.includes("fleet")) hints.push("fleet");
  if (raw.includes("single")) hints.push("single");
  if (raw.includes("double") || raw.includes("twin")) hints.push("double", "twin");

  return pool
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
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => ({
      id: x.room.id,
      display_name: x.room.display_name,
      wing: x.room.wing,
      room_type: x.room.room_type,
      score: x.score,
    }));
}

type ExistingBooking = {
  id: string;
  owner_id: string;
  room_id: string | null;
  check_in_date: string;
  check_out_date: string;
  booking_pets: { pet_id: string }[];
};

function datesOverlap(aIn: string, aOut: string, bIn: string, bOut: string) {
  return aIn < bOut && bIn < aOut;
}

function findOverlappingBooking(
  stay: MshBoardingStay,
  ownerId: string,
  petId: string,
  bookings: ExistingBooking[],
) {
  return (
    bookings.find(
      (b) =>
        b.owner_id === ownerId &&
        b.booking_pets.some((bp) => bp.pet_id === petId) &&
        datesOverlap(stay.start_date, stay.end_date, b.check_in_date, b.check_out_date),
    ) ?? null
  );
}

const LONG_NIGHT_THRESHOLD = 120;

export function matchMshStays(
  stays: MshBoardingStay[],
  owners: OwnerWithPetsIndex[],
  rooms: RoomRow[],
  bookings: ExistingBooking[],
): MshStayMatch[] {
  return stays
    .map((stay) => {
      const ownerCandidates = owners
        .map((o) => ({ owner: o, score: nameScore(stay.owner_name, o) }))
        .filter((x) => x.score >= 40)
        .sort((a, b) => b.score - a.score);

      const top = ownerCandidates[0];
      const second = ownerCandidates[1];
      const ambiguous =
        !!top &&
        !!second &&
        top.score >= 60 &&
        second.score >= 60 &&
        top.score - second.score < 15;

      let match_status: MshMatchStatus = "no_owner";
      let owner_id: string | null = null;
      let owner_db_name: string | null = null;
      let owner_match_score = 0;
      let pet_id: string | null = null;
      let pet_match_score = 0;
      let pet_alternatives: MshStayMatch["pet_alternatives"] = [];

      if (top && top.score >= 60 && !ambiguous) {
        owner_id = top.owner.id;
        owner_db_name = ownerFullName(top.owner);
        owner_match_score = top.score;
        const ranked = petScores(stay.pet_name, top.owner.pets ?? []);
        pet_alternatives = ranked.map((r) => ({
          id: r.pet.id,
          name: r.pet.name,
          score: r.score,
        }));
        if (ranked[0]) {
          pet_id = ranked[0].pet.id;
          pet_match_score = ranked[0].score;
          match_status = pet_match_score >= 75 ? "ready" : "owner_only";
        } else match_status = "owner_only";
      } else if (ambiguous) {
        match_status = "owner_ambiguous";
      } else if (top && top.score >= 40) {
        match_status = "owner_weak";
        owner_id = top.owner.id;
        owner_db_name = ownerFullName(top.owner);
        owner_match_score = top.score;
      }

      const room_suggestions = suggestRooms(stay.calendar_room, rooms);
      const room_needs_review =
        !!stay.room_review_flag?.trim() ||
        room_suggestions.length === 0 ||
        (stay.calendar_room ?? "").length > 60;

      const existing =
        owner_id && pet_id
          ? findOverlappingBooking(stay, owner_id, pet_id, bookings)
          : null;

      if (existing) match_status = "already_in_db";

      const importable =
        match_status === "ready" &&
        !existing &&
        room_suggestions.length > 0 &&
        stay.night_count <= LONG_NIGHT_THRESHOLD;

      return {
        ...stay,
        match_status,
        owner_id,
        owner_db_name,
        owner_match_score,
        owner_alternatives: ownerCandidates.slice(0, 5).map((c) => ({
          id: c.owner.id,
          name: ownerFullName(c.owner),
          score: c.score,
          phone: c.owner.phone,
        })),
        pet_id,
        pet_match_score,
        pet_alternatives,
        room_suggestions,
        room_needs_review,
        existing_booking_id: existing?.id ?? null,
        importable,
      };
    })
    .sort((a, b) =>
      `${a.start_date}${a.owner_name}`.localeCompare(`${b.start_date}${b.owner_name}`),
    );
}

export function summarizeMatches(rows: MshStayMatch[]) {
  return {
    total: rows.length,
    ready: rows.filter((r) => r.match_status === "ready").length,
    importable: rows.filter((r) => r.importable).length,
    owner_only: rows.filter((r) => r.match_status === "owner_only").length,
    owner_ambiguous: rows.filter((r) => r.match_status === "owner_ambiguous").length,
    no_owner: rows.filter((r) => r.match_status === "no_owner" || r.match_status === "owner_weak")
      .length,
    already_in_db: rows.filter((r) => r.match_status === "already_in_db").length,
    room_needs_review: rows.filter((r) => r.room_needs_review).length,
  };
}
