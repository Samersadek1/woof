import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

/** Synthetic wing for PetExec import rows awaiting a real kennel assignment. */
export const IMPORT_PLACEHOLDER_WING = "import_placeholder" as const;

export const DOG_UNKNOWN_TIER_ORDER = [
  "standard",
  "deluxe",
  "royal",
  "presidential",
  "family",
  "unknown",
] as const;

export type DogUnknownTier = (typeof DOG_UNKNOWN_TIER_ORDER)[number];

export const DOG_UNKNOWN_TIER_LABELS: Record<DogUnknownTier, string> = {
  standard: "Standard Suite",
  deluxe: "Deluxe Suite",
  royal: "Royal Suite",
  presidential: "Presidential Suite",
  family: "Family Room",
  unknown: "Tier not set",
};

const PLACEHOLDER_ROOM_NUMBER_PREFIX = "UNK-";

export function isBoardingFacilityRoom(room: Pick<Room, "wing">): boolean {
  return room.wing !== "cattery";
}

/**
 * Synthetic PetExec / import rows awaiting a real kennel — not every room on
 * `import_placeholder` wing (many imported A1/B1/Dcare* rows are real kennels).
 */
export function isImportPlaceholderRoom(
  room: Pick<Room, "wing" | "room_number" | "notes" | "display_name">,
): boolean {
  const num = (room.room_number ?? "").trim();
  if (num.startsWith(PLACEHOLDER_ROOM_NUMBER_PREFIX)) return true;
  if ((room.notes ?? "").includes("import_placeholder_tier=")) return true;
  const name = (room.display_name ?? "").trim();
  if (name.startsWith("Unknown ·") || name.startsWith("Unknown -")) return true;
  return false;
}

export function isImportPlaceholderBooking(
  booking: {
    notes?: string | null;
    rooms?: Pick<Room, "wing" | "room_number" | "notes" | "display_name"> | null;
  },
): boolean {
  if (booking.rooms && isImportPlaceholderRoom(booking.rooms)) return true;
  const notes = booking.notes ?? "";
  return notes.includes("import_placeholder") || notes.includes("Imported from PetExec");
}

function normKennelText(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
}

/** Infer suite tier from PetExec kennel / calendar room labels (dog boarding). */
export function inferImportTier(kennelText: string): DogUnknownTier {
  const raw = normKennelText(kennelText);
  if (!raw || raw.includes("not assigned") || raw === "unknown" || raw === "n a") {
    return "unknown";
  }

  if (raw.includes("presidential")) return "presidential";
  if (raw.includes("royal")) return "royal";
  if (raw.includes("deluxe") || raw.includes("dluxe")) return "deluxe";
  if (raw.includes("standard") || raw.includes("fleet") || raw.includes("glass")) return "standard";
  if (raw.includes("family")) return "family";
  return "unknown";
}

export function placeholderTierForRoom(
  room: Pick<Room, "room_type" | "notes">,
): DogUnknownTier | null {
  const fromNotes = (room.notes ?? "").match(/import_placeholder_tier=([a-z0-9_]+)/i)?.[1];
  const tier = (fromNotes ?? room.room_type ?? "").toLowerCase();
  if (DOG_UNKNOWN_TIER_ORDER.includes(tier as DogUnknownTier)) return tier as DogUnknownTier;
  return null;
}

export function splitFacilityAndPlaceholderRooms(rooms: Room[]) {
  const placeholders = rooms.filter((r) => r.is_active && isImportPlaceholderRoom(r));
  const facility = rooms.filter((r) => {
    if (!r.is_active) return false;
    if (isImportPlaceholderRoom(r)) return false;
    return isBoardingFacilityRoom(r);
  });
  return { facility, placeholders };
}

/** Active import placeholder rows, sorted for calendar display (no tier grouping). */
export function sortImportPlaceholderRooms(rooms: Room[]): Room[] {
  return rooms
    .filter(isImportPlaceholderRoom)
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { numeric: true }),
    );
}

/** @deprecated Use sortImportPlaceholderRooms — woof UI no longer groups placeholders by tier. */
export function groupPlaceholderRoomsByTier(rooms: Room[]) {
  const sorted = sortImportPlaceholderRooms(rooms);
  if (sorted.length === 0) return [];
  return [{ tier: "unknown", label: "Imported", rooms: sorted }];
}

export const IMPORT_PLACEHOLDER_STATUS_CLASS =
  "bg-amber-500/90 text-white hover:bg-amber-600 border border-dashed border-amber-200";

export const IMPORT_PLACEHOLDER_ROW_BG = "bg-amber-50/80";
