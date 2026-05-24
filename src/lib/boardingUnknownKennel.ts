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

export const CAT_UNKNOWN_TIER_ORDER = [
  "cattery_deluxe",
  "cattery_presidential",
  "cattery_super_presidential",
  "unknown",
] as const;

export type CatUnknownTier = (typeof CAT_UNKNOWN_TIER_ORDER)[number];

export const CAT_UNKNOWN_TIER_LABELS: Record<CatUnknownTier, string> = {
  cattery_deluxe: "Deluxe",
  cattery_presidential: "Presidential",
  cattery_super_presidential: "Super Presidential",
  unknown: "Tier not set",
};

const PLACEHOLDER_ROOM_NUMBER_PREFIX = "UNK-";

export function isImportPlaceholderRoom(room: Pick<Room, "wing" | "room_number" | "notes">): boolean {
  if (room.wing === IMPORT_PLACEHOLDER_WING) return true;
  if ((room.room_number ?? "").startsWith(PLACEHOLDER_ROOM_NUMBER_PREFIX)) return true;
  return (room.notes ?? "").includes("import_placeholder_tier=");
}

export function isImportPlaceholderBooking(
  booking: { notes?: string | null; rooms?: Pick<Room, "wing" | "room_number" | "notes"> | null },
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

/** Infer suite tier from PetExec kennel / calendar room labels. */
export function inferImportTier(
  kennelText: string,
  species: "dog" | "cat",
): DogUnknownTier | CatUnknownTier {
  const raw = normKennelText(kennelText);
  if (!raw || raw.includes("not assigned") || raw === "unknown" || raw === "n a") {
    return "unknown";
  }

  if (species === "cat") {
    if (raw.includes("super presidential")) return "cattery_super_presidential";
    if (raw.includes("presidential")) return "cattery_presidential";
    if (raw.includes("deluxe") || raw.includes("cattery")) return "cattery_deluxe";
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
  species: "dog" | "cat",
): DogUnknownTier | CatUnknownTier | null {
  const fromNotes = (room.notes ?? "").match(/import_placeholder_tier=([a-z0-9_]+)/i)?.[1];
  const tier = (fromNotes ?? room.room_type ?? "").toLowerCase();
  if (species === "cat") {
    if (tier.includes("super")) return "cattery_super_presidential";
    if (tier.includes("presidential")) return "cattery_presidential";
    if (tier.includes("deluxe")) return "cattery_deluxe";
    return tier === "unknown" ? "unknown" : null;
  }
  if (DOG_UNKNOWN_TIER_ORDER.includes(tier as DogUnknownTier)) return tier as DogUnknownTier;
  return null;
}

export function splitFacilityAndPlaceholderRooms(rooms: Room[], species: "dog" | "cat") {
  const placeholders = rooms.filter((r) => r.is_active && isImportPlaceholderRoom(r));
  const facility = rooms.filter((r) => {
    if (!r.is_active) return false;
    if (isImportPlaceholderRoom(r)) return false;
    return species === "cat" ? r.wing === "cattery" : r.wing !== "cattery";
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
export function groupPlaceholderRoomsByTier(rooms: Room[], species: "dog" | "cat") {
  const sorted = sortImportPlaceholderRooms(rooms);
  if (sorted.length === 0) return [];
  return [{ tier: "unknown", label: "Imported", rooms: sorted }];
}

export const IMPORT_PLACEHOLDER_STATUS_CLASS =
  "bg-amber-500/90 text-white hover:bg-amber-600 border border-dashed border-amber-200";

export const IMPORT_PLACEHOLDER_ROW_BG = "bg-amber-50/80";
