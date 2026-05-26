import { format, parseISO } from "date-fns";

import type { BookingWithDetails } from "@/hooks/useBookings";
import type { CalendarRoomAssignment } from "@/hooks/useBookings";
import type { Database } from "@/integrations/supabase/types";
import { assignmentCoversDate, bookingOccupiesDate } from "@/lib/bookingRoomDisplay";
import {
  buildKennelAssignmentContext,
  hasKennelRoomOnDate,
  type KennelAssignmentSlice,
} from "@/lib/kennelAssignmentOnDate";
import { formatRoomSectionLabel } from "@/lib/boardingRoomSections";
import { buildRoomsBySection } from "@/lib/boardingRoomSections";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function guestLabel(booking: BookingWithDetails): string {
  const pet = booking.booking_pets?.[0]?.pets?.name?.toUpperCase() ?? "";
  const owner = booking.owners?.last_name?.toUpperCase() ?? "";
  return [pet, owner].filter(Boolean).join(" – ") || booking.booking_ref || "—";
}

function guestsInRoomOnDate(args: {
  roomId: string;
  asOfDate: string;
  assignmentsByRoom: Map<string, CalendarRoomAssignment[]>;
  bookingsByRoom: Map<string, BookingWithDetails[]>;
}): string[] {
  const { roomId, asOfDate, assignmentsByRoom, bookingsByRoom } = args;
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const row of assignmentsByRoom.get(roomId) ?? []) {
    if (!assignmentCoversDate(row, asOfDate)) continue;
    const booking = row.bookings;
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);
    labels.push(guestLabel(booking));
  }

  for (const booking of bookingsByRoom.get(roomId) ?? []) {
    if (booking.check_in_date > asOfDate || booking.check_out_date <= asOfDate) continue;
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);
    labels.push(guestLabel(booking));
  }

  return labels;
}

export function buildBoardingRoomCalendarDayHtml(args: {
  asOfDate: string;
  rooms: Room[];
  assignmentsByRoom: Map<string, CalendarRoomAssignment[]>;
  bookingsByRoom: Map<string, BookingWithDetails[]>;
  unassignedBookings: BookingWithDetails[];
  roomAssignments?: CalendarRoomAssignment[];
}): string {
  const {
    asOfDate,
    rooms,
    assignmentsByRoom,
    bookingsByRoom,
    unassignedBookings,
    roomAssignments = [],
  } = args;
  const kennelCtx = buildKennelAssignmentContext(rooms);
  const assignmentSlices: KennelAssignmentSlice[] = roomAssignments.map((row) => ({
    booking_id: row.booking_id,
    room_id: row.room_id,
    start_date: row.start_date,
    end_date: row.end_date,
  }));
  const titleDate = format(parseISO(asOfDate), "EEEE, d MMMM yyyy");
  const { map: roomsBySection, order } = buildRoomsBySection(rooms);

  const sectionRows = order
    .map((sectionKey) => {
      const sectionRooms = roomsBySection.get(sectionKey) ?? [];
      if (sectionRooms.length === 0) return "";
      const roomRows = sectionRooms
        .map((room) => {
          const guests = guestsInRoomOnDate({
            roomId: room.id,
            asOfDate,
            assignmentsByRoom,
            bookingsByRoom,
          });
          return `<tr>
            <td class="room">${escapeHtml(formatRoomSectionLabel(room))}</td>
            <td>${escapeHtml(guests.length > 0 ? guests.join("; ") : "—")}</td>
          </tr>`;
        })
        .join("");
      return `<tr class="section"><td colspan="2">${escapeHtml(sectionKey)}</td></tr>${roomRows}`;
    })
    .join("");

  const unassignedLabels = unassignedBookings
    .filter(
      (b) =>
        bookingOccupiesDate(b.check_in_date, b.check_out_date, asOfDate) &&
        !hasKennelRoomOnDate(b, assignmentSlices, kennelCtx, asOfDate),
    )
    .map((b) => guestLabel(b));

  const unassignedRow =
    unassignedLabels.length > 0
      ? `<tr class="section"><td colspan="2">Unassigned</td></tr>
         <tr><td class="room">No room</td><td>${escapeHtml(unassignedLabels.join("; "))}</td></tr>`
      : "";

  return `<!DOCTYPE html><html><head><title>Room calendar — ${escapeHtml(titleDate)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: #111; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  tr.section td { background: #e5e7eb; font-weight: 700; font-size: 11px; text-transform: uppercase; }
  td.room { font-weight: 600; white-space: nowrap; width: 120px; }
  @media print { body { padding: 8px; } }
</style></head><body>
  <h1>Dog boarding — room calendar</h1>
  <p class="sub">${escapeHtml(titleDate)}</p>
  <table>
    <thead><tr><th>Room</th><th>Guest</th></tr></thead>
    <tbody>${sectionRows}${unassignedRow}</tbody>
  </table>
</body></html>`;
}

export function printBoardingRoomCalendarDay(html: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
