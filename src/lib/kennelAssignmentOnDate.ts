import { addDays, format, parseISO } from "date-fns";

import type { Database } from "@/integrations/supabase/types";
import { kennelOccupancyRoomPool } from "./boardingKennelRooms";
import { splitFacilityAndPlaceholderRooms } from "./boardingUnknownKennel";
import {
  assignmentCoversDate,
  bookingLastOccupiedNight,
  bookingOccupiesDate,
} from "./bookingRoomDisplay";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type KennelAssignmentContext = {
  kennelPoolIds: Set<string>;
  placeholderIds: Set<string>;
};

export type KennelAssignmentSlice = {
  booking_id: string;
  room_id: string;
  start_date: string;
  end_date: string;
};

export function buildKennelAssignmentContext(facilityRooms: Room[]): KennelAssignmentContext {
  const kennelPool = kennelOccupancyRoomPool(facilityRooms);
  const { placeholders } = splitFacilityAndPlaceholderRooms(facilityRooms);
  return {
    kennelPoolIds: new Set(kennelPool.map((r) => r.id)),
    placeholderIds: new Set(placeholders.filter((r) => r.is_active).map((r) => r.id)),
  };
}

/** Matches occupancy report: kennel pool BRA on `asOfDate`, else legacy `bookings.room_id` in pool. */
export function hasKennelRoomOnDate(
  booking: { id: string; room_id: string | null },
  assignments: KennelAssignmentSlice[],
  ctx: KennelAssignmentContext,
  asOfDate: string,
): boolean {
  let handledByAssignment = false;

  for (const row of assignments) {
    if (row.booking_id !== booking.id) continue;
    if (!assignmentCoversDate(row, asOfDate)) continue;

    if (ctx.placeholderIds.has(row.room_id)) {
      handledByAssignment = true;
      continue;
    }

    if (ctx.kennelPoolIds.has(row.room_id)) {
      return true;
    }
  }

  if (!handledByAssignment && booking.room_id && ctx.kennelPoolIds.has(booking.room_id)) {
    return true;
  }

  return false;
}

/** Contiguous date ranges (inclusive nights) within the window where the guest lacks a kennel room. */
export function unassignedNightRangesInWindow(
  booking: {
    id: string;
    room_id: string | null;
    check_in_date: string;
    check_out_date: string;
  },
  assignments: KennelAssignmentSlice[],
  ctx: KennelAssignmentContext,
  windowStart: string,
  windowEnd: string,
): Array<{ start: string; end: string }> {
  const lastNight = bookingLastOccupiedNight(booking.check_in_date, booking.check_out_date);
  const rangeStart = booking.check_in_date > windowStart ? booking.check_in_date : windowStart;
  const rangeEnd = lastNight < windowEnd ? lastNight : windowEnd;
  if (rangeStart > rangeEnd) return [];

  const ranges: Array<{ start: string; end: string }> = [];
  let openStart: string | null = null;

  for (
    let day = parseISO(rangeStart);
    ;
    day = addDays(day, 1)
  ) {
    const dayStr = format(day, "yyyy-MM-dd");
    const pastEnd = dayStr > rangeEnd;

    const unassigned =
      !pastEnd &&
      bookingOccupiesDate(booking.check_in_date, booking.check_out_date, dayStr) &&
      !hasKennelRoomOnDate(booking, assignments, ctx, dayStr);

    if (unassigned && !openStart) {
      openStart = dayStr;
    } else if (!unassigned && openStart) {
      ranges.push({
        start: openStart,
        end: format(addDays(day, -1), "yyyy-MM-dd"),
      });
      openStart = null;
    }

    if (pastEnd) break;
  }

  return ranges;
}
