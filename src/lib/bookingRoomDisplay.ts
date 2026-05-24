import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

export type BookingRoomAssignmentRoom = Pick<Room, "room_number" | "display_name" | "cam_id">;

export type BookingRoomAssignmentSlice = {
  start_date: string;
  end_date: string;
  rooms: BookingRoomAssignmentRoom | null;
};

/** Room label for kennel card / detail — prefers booking.room_id, else import assignment on check-in. */
export function roomLabelForBooking(
  booking: {
    check_in_date: string;
    rooms?: BookingRoomAssignmentRoom | null;
  },
  assignments: BookingRoomAssignmentSlice[] | null | undefined,
): string {
  const fromBooking = booking.rooms?.room_number?.trim() || booking.rooms?.display_name?.trim();
  if (fromBooking) return fromBooking;

  const rows = assignments ?? [];
  if (rows.length === 0) return "Unassigned";

  const onCheckIn =
    rows.find((a) => a.start_date === booking.check_in_date) ??
    [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const room = onCheckIn?.rooms;
  return room?.room_number?.trim() || room?.display_name?.trim() || "Unassigned";
}
