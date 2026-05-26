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

  const facilityRoomIds = useMemo(() => {
    const { facility } = splitFacilityAndPlaceholderRooms(rooms);
    const assignable = facility.filter((r) => !isExcludedBoardingRoom(r));
    return boardingCalendarFacilityRoomIds(assignable);
  }, [rooms]);

  const model = useMemo(
    () =>
      buildBoardingCalendarModel({
        bookings,
        roomAssignments: roomAssignments as CalendarRoomAssignment[],
        facilityRoomIds,
      }),
    [bookings, roomAssignments, facilityRoomIds],
  );

  return {
    model,
    facilityRoomIds,
    isLoading: bookingsLoading || assignmentsLoading || roomsLoading,
  };
}
