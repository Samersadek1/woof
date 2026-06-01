import type { KennelMapOccupancy, KennelMapRoom } from "@/hooks/useBoardingCapacity";
import type { RoomSizeClass } from "@/lib/boardingCapacity";

const ZONE_ORDER = [
  "A",
  "B",
  "C",
  "D",
  "Grooming",
  "Daycare 1",
  "Daycare 2",
  "Daycare Spaces",
] as const;

export const KENNEL_MAP_OVERFLOW_ZONE = "Overflow";

export function compareKennelMapZones(a: string, b: string): number {
  if (a === KENNEL_MAP_OVERFLOW_ZONE) return 1;
  if (b === KENNEL_MAP_OVERFLOW_ZONE) return -1;
  const ia = ZONE_ORDER.indexOf(a as (typeof ZONE_ORDER)[number]);
  const ib = ZONE_ORDER.indexOf(b as (typeof ZONE_ORDER)[number]);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function kennelMapRoomLabel(room: KennelMapRoom): string {
  return room.display_name?.trim() || room.name?.trim() || room.room_number;
}

export function kennelMapOccupantLabel(row: KennelMapOccupancy): string {
  const ref = row.bookings?.booking_ref;
  const pets =
    row.bookings?.booking_pets
      ?.map((bp) => bp.pets?.name)
      .filter(Boolean)
      .join(", ") ?? "";
  return pets || ref || "Occupied";
}

export type KennelMapZoneGroup = {
  zone: string;
  rooms: KennelMapRoom[];
  sizeClass: RoomSizeClass;
};

export function groupKennelMapRoomsByZone(rooms: KennelMapRoom[]): KennelMapZoneGroup[] {
  const map = new Map<string, KennelMapRoom[]>();
  for (const room of rooms) {
    const z = room.zone ?? "Other";
    if (!map.has(z)) map.set(z, []);
    map.get(z)!.push(room);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      kennelMapRoomLabel(a).localeCompare(kennelMapRoomLabel(b), undefined, { numeric: true }),
    );
  }
  const keys = Array.from(map.keys()).sort(compareKennelMapZones);
  return keys.map((zone) => ({
    zone,
    rooms: map.get(zone)!,
    sizeClass: map.get(zone)![0]?.size_class ?? "standard",
  }));
}
