import type { Database } from "@/integrations/supabase/types";
import { isExcludedBoardingRoom } from "./boardingRoomSections";
import { isImportPlaceholderRoom } from "./boardingUnknownKennel";
import { isRetiredCatteryWing } from "./retiredFacilities";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

/** Wings excluded from overnight dog kennel capacity (matches occupancy report). */
export const NON_KENNEL_OCCUPANCY_WINGS = new Set(["grooming_upstairs"]);

/** Active kennel room in the occupancy / capacity pool (not daycare, grooming, import UNK). */
export function isKennelOccupancyRoom(room: Pick<Room, "is_active" | "wing" | "room_number" | "display_name" | "notes">): boolean {
  if (!room.is_active || isImportPlaceholderRoom(room)) return false;
  if (isRetiredCatteryWing(room.wing)) return false;
  if (NON_KENNEL_OCCUPANCY_WINGS.has(room.wing)) return false;
  return !isExcludedBoardingRoom(room);
}

export function kennelOccupancyRoomPool(
  rooms: Room[],
): Room[] {
  return rooms.filter(isKennelOccupancyRoom);
}

/** Rooms shown on the boarding calendar grid (facility dog kennels, not placeholders). */
export function isBoardingCalendarFacilityRoom(
  room: Pick<Room, "wing" | "room_number" | "display_name" | "notes" | "is_active">,
): boolean {
  if (isRetiredCatteryWing(room.wing) || isImportPlaceholderRoom(room)) return false;
  return !isExcludedBoardingRoom(room);
}

export function boardingCalendarFacilityRoomIds(rooms: Room[]): Set<string> {
  return new Set(rooms.filter(isBoardingCalendarFacilityRoom).map((r) => r.id));
}
