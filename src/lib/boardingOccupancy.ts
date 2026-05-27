import type { BookingWithDetails } from "@/hooks/useBookings";
import type { Database } from "@/integrations/supabase/types";
import { kennelOccupancyRoomPool } from "./boardingKennelRooms";
import {
  buildRoomsBySection,
  getRoomSectionParts,
  sortRoomsBySectionNumber,
} from "./boardingRoomSections";
import { assignmentCoversDate, bookingOccupiesDate } from "./bookingRoomDisplay";
import {
  buildKennelAssignmentContext,
  hasKennelRoomOnDate,
  type KennelAssignmentSlice,
} from "./kennelAssignmentOnDate";
import {
  isImportPlaceholderRoom,
  splitFacilityAndPlaceholderRooms,
} from "./boardingUnknownKennel";

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
  /** Kennel rooms with a guest (physical room). */
  roomOccupiedCount: number;
  /** Boarding guests on site with no kennel room for this date. */
  unassignedGuestCount: number;
  /** Rooms occupied + unassigned guests (capacity used). */
  occupiedCount: number;
  availableCount: number;
  pct: number;
  /** Pets on site (sum of booking_pets; multi-pet rooms count each pet). */
  totalPetCount: number;
  /** Pets in assigned kennel rooms. */
  roomOccupiedPetCount: number;
  /** Pets in unassigned bookings. */
  unassignedPetCount: number;
  byGroup: Map<string, { occupied: { room: Room; booking: BookingWithDetails }[]; available: Room[] }>;
  groupOrder: string[];
  importedUnassignedCount: number;
  unassignedGuests: BookingWithDetails[];
};

export function bookingPetCount(booking: BookingWithDetails): number {
  return booking.booking_pets?.length ?? 0;
}

function isBookingImportPlaceholderOnlyOnDate(
  bookingId: string,
  assignments: OccupancyAssignmentRow[],
  placeholderIds: Set<string>,
  asOfDate: string,
): boolean {
  const onDate = assignments.filter(
    (row) => row.booking_id === bookingId && assignmentCoversDate(row, asOfDate),
  );
  if (onDate.length === 0) return false;
  return onDate.every((row) => placeholderIds.has(row.room_id));
}

function occupancyFacilityRooms(rooms: Room[]): Room[] {
  return kennelOccupancyRoomPool(rooms);
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
}): OccupancyStats {
  const { asOfDate, facilityRooms, bookings, assignments } = args;
  const roomsPool = occupancyFacilityRooms(facilityRooms);
  const placeholderPool = occupancyPlaceholderRooms(facilityRooms);
  const poolIds = new Set(roomsPool.map((r) => r.id));
  const placeholderIds = new Set(placeholderPool.map((r) => r.id));
  const total = roomsPool.length;
  const kennelCtx = buildKennelAssignmentContext(facilityRooms);
  const assignmentSlices: KennelAssignmentSlice[] = assignments;

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

  const unassignedGuests: BookingWithDetails[] = [];

  for (const b of bookings) {
    if (!bookingOccupiesDate(b.check_in_date, b.check_out_date, asOfDate)) continue;

    const onImportPlaceholder = assignments.some(
      (row) =>
        row.booking_id === b.id &&
        assignmentCoversDate(row, asOfDate) &&
        placeholderIds.has(row.room_id),
    );
    if (onImportPlaceholder) continue;

    if (hasKennelRoomOnDate(b, assignmentSlices, kennelCtx, asOfDate)) {
      if (
        b.room_id &&
        poolIds.has(b.room_id) &&
        !placeholderIds.has(b.room_id) &&
        !occupiedByRoomId.has(b.room_id)
      ) {
        occupiedByRoomId.set(b.room_id, b);
      }
      continue;
    }

    unassignedGuests.push(b);
  }

  const roomOccupiedCount = occupiedByRoomId.size;
  const unassignedGuestCount = unassignedGuests.length;
  const occupiedCount = roomOccupiedCount + unassignedGuestCount;
  const availableCount = Math.max(0, total - occupiedCount);
  const pct = total > 0 ? Math.round((occupiedCount / total) * 1000) / 10 : 0;

  let totalPetCount = 0;
  let roomOccupiedPetCount = 0;
  let unassignedPetCount = 0;

  for (const b of bookings) {
    if (!bookingOccupiesDate(b.check_in_date, b.check_out_date, asOfDate)) continue;
    if (isBookingImportPlaceholderOnlyOnDate(b.id, assignments, placeholderIds, asOfDate)) continue;
    totalPetCount += bookingPetCount(b);
  }

  for (const booking of occupiedByRoomId.values()) {
    roomOccupiedPetCount += bookingPetCount(booking);
  }
  for (const booking of unassignedGuests) {
    unassignedPetCount += bookingPetCount(booking);
  }

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

  return {
    total,
    roomOccupiedCount,
    unassignedGuestCount,
    occupiedCount,
    availableCount,
    pct,
    totalPetCount,
    roomOccupiedPetCount,
    unassignedPetCount,
    byGroup,
    groupOrder,
    importedUnassignedCount,
    unassignedGuests,
  };
}
