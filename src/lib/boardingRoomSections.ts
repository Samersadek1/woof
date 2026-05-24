import type { Database } from "@/integrations/supabase/types";

type RoomLike = Pick<
  Database["public"]["Tables"]["rooms"]["Row"],
  "room_number" | "display_name"
> &
  Partial<Pick<Database["public"]["Tables"]["rooms"]["Row"], "id" | "room_type">>;

/** Legacy / import rows that must not appear in boarding room pickers or calendars. */
const EXCLUDED_ROOM_CODES = new Set(["F100", "D100"]);

/**
 * Label used to derive section + room number.
 * Prefer room_number when it contains a letter prefix before trailing digits (e.g. A1, Dcare2b2).
 * Otherwise fall back to display_name (e.g. "Oxford Street 1" when room_number is only "1").
 */
export function roomNameForSectionParse(room: RoomLike): string {
  const num = (room.room_number ?? "").trim();
  if (/[a-zA-Z]/.test(num) && /\d$/.test(num)) return num;
  const display = (room.display_name ?? "").trim();
  return display || num;
}

/** Last run of digits = room number; everything before (trimmed) = section. */
export function parseRoomSectionAndNumber(name: string): {
  section: string;
  roomNumber: string;
} {
  const trimmed = name.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return { section: trimmed || "Other", roomNumber: "" };
  }
  const section = match[1].trim();
  return {
    section: section || "Other",
    roomNumber: match[2],
  };
}

export function getRoomSectionParts(room: RoomLike): {
  section: string;
  roomNumber: string;
  label: string;
} {
  const label = roomNameForSectionParse(room);
  const { section, roomNumber } = parseRoomSectionAndNumber(label);
  return { section, roomNumber, label };
}

export function isExcludedBoardingRoom(room: RoomLike): boolean {
  const num = (room.room_number ?? "").trim();
  if (EXCLUDED_ROOM_CODES.has(num.toUpperCase())) return true;
  const normalized = roomNameForSectionParse(room).replace(/\s+/g, "").toUpperCase();
  return EXCLUDED_ROOM_CODES.has(normalized);
}

export function sortRoomsBySectionNumber(
  a: RoomLike,
  b: RoomLike,
): number {
  const pa = getRoomSectionParts(a);
  const pb = getRoomSectionParts(b);
  const sectionCmp = pa.section.localeCompare(pb.section, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (sectionCmp !== 0) return sectionCmp;
  return pa.roomNumber.localeCompare(pb.roomNumber, undefined, { numeric: true });
}

export function buildRoomsBySection<T extends RoomLike>(rooms: T[]): {
  map: Map<string, T[]>;
  order: string[];
} {
  const map = new Map<string, T[]>();
  for (const room of rooms) {
    const { section } = getRoomSectionParts(room);
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(room);
  }
  for (const list of map.values()) {
    list.sort(sortRoomsBySectionNumber);
  }
  const order = Array.from(map.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  return { map, order };
}

export function formatRoomSectionLabel(room: RoomLike): string {
  const { section, roomNumber, label } = getRoomSectionParts(room);
  if (section && roomNumber) return `${section} ${roomNumber}`;
  return label || (room.room_number ?? "—");
}

type RoomPickerLike = RoomLike & {
  room_type?: string | null;
};

/** Boarding UI label — section + room type only (no single/twin capacity). */
export function formatBoardingRoomPickerLabel(room: RoomPickerLike): string {
  const section = formatRoomSectionLabel(room);
  const type = room.room_type?.replace(/_/g, " ");
  return type ? `${section} — ${type}` : section;
}
