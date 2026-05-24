import type { BookingWithDetails } from "@/hooks/useBookings";
import type { Database } from "@/integrations/supabase/types";
import { assignmentCoversDate } from "@/lib/bookingRoomDisplay";
import {
  buildRoomsBySection,
  getRoomSectionParts,
  sortRoomsBySectionNumber,
} from "@/lib/boardingRoomSections";
import {
  isImportPlaceholderRoom,
  splitFacilityAndPlaceholderRooms,
} from "@/lib/boardingUnknownKennel";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type OccupancyAssignmentRow = {
  booking_id: string;
  room_id: string;
  start_date: string;
  end_date: string;
  bookings: BookingWithDetails;
};

export type OccupancyStats = {
  total: number;
  occupiedCount: number;
  availableCount: number;
  pct: number;
  byGroup: Map<string, { occupied: { room: Room; booking: BookingWithDetails }[]; available: Room[] }>;
  groupOrder: string[];
  importedUnassignedCount: number;
};

function occupancyFacilityRooms(rooms: Room[]): Room[] {
  return rooms.filter((r) => {
    if (!r.is_active || isImportPlaceholderRoom(r)) return false;
    return r.wing !== "cattery";
  });
}

function occupancyPlaceholderRooms(rooms: Room[]): Room[] {
  const { placeholders } = splitFacilityAndPlaceholderRooms(rooms);
  return placeholders.filter((r) => r.is_active);
}

export function computeBoardingOccupancyStats(args: {
  asOfDate: string;
  facilityRooms: Room[];
  bookings: BookingWithDetails[];
  assignments: OccupancyAssignmentRow[];
  isExcludedBoardingRoom: (room: Room) => boolean;
}): OccupancyStats {
  const { asOfDate, facilityRooms, bookings, assignments, isExcludedBoardingRoom } = args;
  const roomsPool = occupancyFacilityRooms(facilityRooms).filter((r) => !isExcludedBoardingRoom(r));
  const placeholderPool = occupancyPlaceholderRooms(facilityRooms);
  const poolIds = new Set(roomsPool.map((r) => r.id));
  const placeholderIds = new Set(placeholderPool.map((r) => r.id));
  const total = roomsPool.length;

  const bookingIdsWithSegmentOnDate = new Set<string>();
  for (const row of assignments) {
    if (!assignmentCoversDate(row, asOfDate)) continue;
    bookingIdsWithSegmentOnDate.add(row.booking_id);
  }

  const occupiedByRoomId = new Map<string, BookingWithDetails>();
  let importedUnassignedCount = 0;

  for (const row of assignments) {
    if (!assignmentCoversDate(row, asOfDate)) continue;
    if (placeholderIds.has(row.room_id)) {
      importedUnassignedCount += 1;
      continue;
    }
    if (!poolIds.has(row.room_id)) continue;
    if (!occupiedByRoomId.has(row.room_id)) {
      occupiedByRoomId.set(row.room_id, row.bookings);
    }
  }

  for (const b of bookings) {
    if (bookingIdsWithSegmentOnDate.has(b.id)) continue;
    if (!b.room_id) continue;
    if (placeholderIds.has(b.room_id)) {
      importedUnassignedCount += 1;
      continue;
    }
    if (!poolIds.has(b.room_id)) continue;
    if (!occupiedByRoomId.has(b.room_id)) occupiedByRoomId.set(b.room_id, b);
  }

  const occupiedCount = occupiedByRoomId.size;
  const availableCount = Math.max(0, total - occupiedCount);
  const pct = total > 0 ? Math.round((occupiedCount / total) * 1000) / 10 : 0;

  const byGroup = new Map<string, { occupied: { room: Room; booking: BookingWithDetails }[]; available: Room[] }>();
  const sortRooms = (a: Room, b: Room) => sortRoomsBySectionNumber(a, b);

  for (const room of roomsPool) {
    const groupKey = getRoomSectionParts(room).section;
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, { occupied: [], available: [] });
    const bucket = byGroup.get(groupKey)!;
    const bk = occupiedByRoomId.get(room.id);
    if (bk) bucket.occupied.push({ room, booking: bk });
    else bucket.available.push(room);
  }
  for (const b of byGroup.values()) {
    b.occupied.sort((x, y) => sortRooms(x.room, y.room));
    b.available.sort(sortRooms);
  }

  const groupOrder = buildRoomsBySection(roomsPool).order.filter((k) => byGroup.has(k));

  return { total, occupiedCount, availableCount, pct, byGroup, groupOrder, importedUnassignedCount };
}
