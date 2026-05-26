import { isToday, parseISO } from "date-fns";

import type { BookingWithDetails } from "@/hooks/useBookings";
import type { BoardingCalendarSegment } from "@/lib/boardingCalendarModel";
import {
  assignmentExtentsByBookingId,
  bookingLastOccupiedNight,
  calendarSegmentLayoutBounds,
  layoutRoomCalendarEvents,
  type RoomCalendarLayoutSegment,
} from "@/lib/bookingRoomDisplay";
import {
  IMPORT_PLACEHOLDER_STATUS_CLASS,
  isImportPlaceholderBooking,
} from "@/lib/boardingUnknownKennel";
import { bookingBelongingsCount } from "@/lib/bookingUtils";
import { bookingAnyPetHasAlerts } from "@/lib/petAlerts";
import { Luggage, TriangleAlert } from "lucide-react";

type Props = {
  days: Date[];
  dayColW: number;
  segments: BoardingCalendarSegment[];
  windowStartStr: string;
  prefillRoomOnEmptyCell?: string;
  isPlaceholder?: boolean;
  toDateStr: (d: Date) => string;
  onEmptyCellClick: (roomId: string | undefined, dayStr: string) => void;
  onGuestClick: (booking: BookingWithDetails, asOfDate: string) => void;
  statusClassFor: (status: BookingWithDetails["status"]) => string;
};

function layoutSegments(
  segments: BoardingCalendarSegment[],
): RoomCalendarLayoutSegment<BookingWithDetails>[] {
  const assignmentExtents = assignmentExtentsByBookingId(
    segments.flatMap((segment) =>
      segment.kind === "assignment"
        ? [
            {
              bookingId: segment.assignment.booking_id,
              start_date: segment.assignment.start_date,
              end_date: segment.assignment.end_date,
            },
          ]
        : [],
    ),
  );

  return segments.map((segment) => {
    const booking =
      segment.kind === "assignment" ? segment.assignment.bookings : segment.booking;

    if (segment.kind === "assignment") {
      const extents = assignmentExtents.get(segment.assignment.booking_id);
      const { segStart, segEnd } = calendarSegmentLayoutBounds({
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        assignmentStart: segment.assignment.start_date,
        assignmentEnd: segment.assignment.end_date,
        isEarliestAssignment:
          segment.assignment.start_date === extents?.minStart,
        isLatestAssignment: segment.assignment.end_date === extents?.maxEnd,
      });
      return { segStart, segEnd, payload: booking };
    }

    return {
      segStart: segment.booking.check_in_date,
      segEnd: bookingLastOccupiedNight(
        segment.booking.check_in_date,
        segment.booking.check_out_date,
      ),
      payload: booking,
    };
  });
}

export function BoardingRoomCalendarRow({
  days,
  dayColW,
  segments,
  windowStartStr,
  prefillRoomOnEmptyCell,
  isPlaceholder = false,
  toDateStr,
  onEmptyCellClick,
  onGuestClick,
  statusClassFor,
}: Props) {
  const dayStrs = days.map((d) => toDateStr(d));
  const events = layoutRoomCalendarEvents(
    layoutSegments(segments),
    dayStrs,
    windowStartStr,
    (booking, segStart, segEnd) => `${booking.id}:${segStart}:${segEnd}`,
  );

  return (
    <div
      className="grid h-12"
      style={{ gridTemplateColumns: `repeat(${days.length}, ${dayColW}px)` }}
    >
      {days.map((day, index) => {
        const dayStr = toDateStr(day);
        const todayHighlight = isToday(day);
        return (
          <div
            key={`cell-${dayStr}`}
            style={{ gridColumn: index + 1, gridRow: 1 }}
            className={`border-r border-b border-border cursor-pointer transition-colors
              ${todayHighlight ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-muted/50"}`}
            onClick={() => onEmptyCellClick(prefillRoomOnEmptyCell, dayStr)}
          />
        );
      })}

      {events.map((ev) => {
        const booking = ev.payload;
        const label = [
          booking.booking_pets?.[0]?.pets?.name?.toUpperCase() ?? "",
          booking.owners?.last_name?.toUpperCase() ?? "",
        ]
          .filter(Boolean)
          .join(" – ");
        const chipPlaceholder = isPlaceholder || isImportPlaceholderBooking(booking);

        return (
          <div
            key={ev.key}
            style={{ gridColumn: `${ev.colStart} / span ${ev.colSpan}`, gridRow: 1 }}
            className={`z-10 mx-0.5 my-1 min-w-0 h-[calc(100%-0.5rem)] rounded text-xs font-medium px-2 flex items-center gap-1
              cursor-pointer truncate select-none border border-dashed
              ${chipPlaceholder ? IMPORT_PLACEHOLDER_STATUS_CLASS : statusClassFor(booking.status)}`}
            onClick={(e) => {
              e.stopPropagation();
              onGuestClick(booking, ev.segStart);
            }}
          >
            <span className="truncate min-w-0 flex-1">{label || booking.booking_ref || "—"}</span>
            {bookingAnyPetHasAlerts(booking) ? (
              <TriangleAlert
                className="h-3.5 w-3.5 shrink-0 text-orange-100 drop-shadow-sm"
                aria-label="Pet alert"
              />
            ) : null}
            {booking.booking_pets.length > 1 && (
              <span className="shrink-0 opacity-80">+{booking.booking_pets.length - 1}</span>
            )}
            {bookingBelongingsCount(booking) > 0 ? (
              <Luggage className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
