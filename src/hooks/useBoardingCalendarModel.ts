import { format } from "date-fns";
import { useMemo } from "react";

import {
  useBookings,
  useBookingRoomAssignmentsForBookings,
  useRooms,
  type CalendarRoomAssignment,
} from "@/hooks/useBookings";
import {
  buildBoardingCalendarModel,
  type BoardingCalendarModel,
} from "@/lib/boardingCalendarModel";
import { boardingCalendarFacilityRoomIds } from "@/lib/boardingKennelRooms";
import { isExcludedBoardingRoom } from "@/lib/boardingRoomSections";
import { splitFacilityAndPlaceholderRooms } from "@/lib/boardingUnknownKennel";

export function useBoardingCalendarModel(
  startDate: string,
  endDate: string,
): {
  model: BoardingCalendarModel;
  facilityRoomIds: Set<string>;
  isLoading: boolean;
} {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(startDate, endDate);
  const bookingIds = useMemo(() => bookings.map((b) => b.id), [bookings]);
  const { data: roomAssignments = [], isLoading: assignmentsLoading } =
    useBookingRoomAssignmentsForBookings(bookingIds, {
      enabled: !bookingsLoading && bookingIds.length > 0,
    });
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();

  const assignableFacilityRooms = useMemo(() => {
    const { facility } = splitFacilityAndPlaceholderRooms(rooms);
    return facility.filter((r) => !isExcludedBoardingRoom(r));
  }, [rooms]);

  const facilityRoomIds = useMemo(
    () => boardingCalendarFacilityRoomIds(assignableFacilityRooms),
    [assignableFacilityRooms],
  );

  const unassignedAsOfDate = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (today >= startDate && today <= endDate) return today;
    return startDate;
  }, [startDate, endDate]);

  const model = useMemo(
    () =>
      buildBoardingCalendarModel({
        bookings,
        roomAssignments: roomAssignments as CalendarRoomAssignment[],
        facilityRoomIds,
        facilityRooms: assignableFacilityRooms,
        windowStart: startDate,
        windowEnd: endDate,
        unassignedAsOfDate,
      }),
    [
      bookings,
      roomAssignments,
      facilityRoomIds,
      assignableFacilityRooms,
      startDate,
      endDate,
      unassignedAsOfDate,
    ],
  );

  return {
    model,
    facilityRoomIds,
    isLoading: bookingsLoading || assignmentsLoading || roomsLoading,
  };
}
