import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRightLeft } from "lucide-react";
import {
  useBookings,
  useBookingRoomAssignments,
  useRooms,
  type BookingWithDetails,
  type CalendarRoomAssignment,
} from "@/hooks/useBookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildRoomsBySection,
  formatRoomSectionLabel,
  isExcludedBoardingRoom,
} from "@/lib/boardingRoomSections";
import {
  isImportPlaceholderBooking,
  isImportPlaceholderRoom,
  splitFacilityAndPlaceholderRooms,
} from "@/lib/boardingUnknownKennel";
import { assignmentCoversDate, roomLabelForBooking, sortedAssignmentSlices } from "@/lib/bookingRoomDisplay";
import { isRetiredCatteryWing } from "@/lib/retiredFacilities";
import { getSegmentForDate } from "@/lib/bookingRoomSegments";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { ChangeRoomDialog } from "@/components/boarding/ChangeRoomDialog";
import type { BookingRoomAssignmentSlice } from "@/lib/bookingRoomDisplay";

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

type ShuffleRow = {
  booking: BookingWithDetails;
  roomId: string;
  slices: BookingRoomAssignmentSlice[];
  movedToday: boolean;
};

function petNames(booking: BookingWithDetails): string {
  return (
    booking.booking_pets
      .map((bp) => bp.pets?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
}

function movedTodayFromNotes(notes: string | null, asOf: string): boolean {
  if (!notes) return false;
  return notes.includes(`[Room move`) && notes.includes(`on ${asOf}`);
}

export function DayShufflePanel({ initialDate }: { initialDate?: string }) {
  const [shuffleDate, setShuffleDate] = useState(initialDate ?? toDateStr(new Date()));
  const [moveTarget, setMoveTarget] = useState<ShuffleRow | null>(null);

  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(shuffleDate, shuffleDate);
  const { data: assignments = [], isLoading: assignmentsLoading } = useBookingRoomAssignments(
    shuffleDate,
    shuffleDate,
  );
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();

  const { facility: facilityRooms } = useMemo(
    () => splitFacilityAndPlaceholderRooms(rooms),
    [rooms],
  );

  const assignableRooms = useMemo(
    () => facilityRooms.filter((r) => !isExcludedBoardingRoom(r) && !isImportPlaceholderRoom(r)),
    [facilityRooms],
  );

  const assignmentsByBooking = useMemo(() => {
    const map = new Map<string, CalendarRoomAssignment[]>();
    for (const row of assignments) {
      const list = map.get(row.booking_id) ?? [];
      list.push(row);
      map.set(row.booking_id, list);
    }
    return map;
  }, [assignments]);

  const { occupiedRows, unassigned } = useMemo(() => {
    const occupied: ShuffleRow[] = [];
    const pending: BookingWithDetails[] = [];
    const seenBookingIds = new Set<string>();

    for (const row of assignments) {
      if (!assignmentCoversDate(row, shuffleDate)) continue;
      if (isRetiredCatteryWing(row.bookings.rooms?.wing)) continue;
      if (isImportPlaceholderRoom(row.rooms)) {
        pending.push(row.bookings);
        seenBookingIds.add(row.booking_id);
        continue;
      }
      const slices = sortedAssignmentSlices(
        (assignmentsByBooking.get(row.booking_id) ?? []).map((a) => ({
          start_date: a.start_date,
          end_date: a.end_date,
          rooms: a.rooms,
        })),
      );
      occupied.push({
        booking: row.bookings,
        roomId: row.room_id,
        slices,
        movedToday: movedTodayFromNotes(row.bookings.notes, shuffleDate),
      });
      seenBookingIds.add(row.booking_id);
    }

    for (const b of bookings) {
      if (b.booking_type && b.booking_type !== "boarding") continue;
      if (isRetiredCatteryWing(b.rooms?.wing)) continue;
      if (seenBookingIds.has(b.id)) continue;

      const slices = sortedAssignmentSlices(
        (assignmentsByBooking.get(b.id) ?? []).map((a) => ({
          start_date: a.start_date,
          end_date: a.end_date,
          rooms: a.rooms,
        })),
      );

      const seg = getSegmentForDate(slices, shuffleDate);
      if (seg) continue;

      if (!b.room_id || isImportPlaceholderBooking(b)) {
        pending.push(b);
        continue;
      }

      occupied.push({
        booking: b,
        roomId: b.room_id,
        slices,
        movedToday: movedTodayFromNotes(b.notes, shuffleDate),
      });
    }

    occupied.sort((a, b) => {
      const roomA = assignableRooms.find((r) => r.id === a.roomId);
      const roomB = assignableRooms.find((r) => r.id === b.roomId);
      const labelA = roomA ? formatRoomSectionLabel(roomA) : "";
      const labelB = roomB ? formatRoomSectionLabel(roomB) : "";
      return labelA.localeCompare(labelB);
    });

    return { occupiedRows: occupied, unassigned: pending };
  }, [assignments, assignmentsByBooking, bookings, shuffleDate, assignableRooms]);

  const roomsBySection = useMemo(
    () => buildRoomsBySection(assignableRooms),
    [assignableRooms],
  );

  const loading = bookingsLoading || assignmentsLoading || roomsLoading;

  return (
    <div className="flex flex-col gap-4 p-4 min-h-0 overflow-auto" data-testid="boarding-day-shuffle">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="shuffle-date">Shuffle date</Label>
          <Input
            id="shuffle-date"
            type="date"
            className="w-[11rem]"
            data-testid="boarding-shuffle-date"
            value={shuffleDate}
            onChange={(e) => setShuffleDate(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground pb-2">
          {format(parseISO(shuffleDate), "EEEE, d MMMM yyyy")} · {occupiedRows.length} in rooms ·{" "}
          {unassigned.length} pending
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            {roomsBySection.order.map((sectionKey) => {
              const sectionRooms = roomsBySection.map.get(sectionKey) ?? [];
              const sectionRows = occupiedRows.filter((row) =>
                sectionRooms.some((r) => r.id === row.roomId),
              );
              if (sectionRows.length === 0) return null;
              return (
                <section key={sectionKey} className="rounded-lg border">
                  <h3 className="text-sm font-semibold px-3 py-2 border-b bg-muted/30">{sectionKey}</h3>
                  <ul className="divide-y">
                    {sectionRows.map((row) => {
                      const room = assignableRooms.find((r) => r.id === row.roomId);
                      const label = roomLabelForBooking(row.booking, row.slices, { asOfDate: shuffleDate });
                      return (
                        <li
                          key={`${row.booking.id}-${row.roomId}`}
                          className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                          data-testid={`boarding-shuffle-row-${row.booking.id}`}
                        >
                          <div className="min-w-[5rem] font-medium text-sm">
                            {room ? formatRoomSectionLabel(room) : label}
                          </div>
                          <div className="flex-1 min-w-[10rem]">
                            <p className="text-sm font-medium">{petNames(row.booking)}</p>
                            <p className="text-xs text-muted-foreground">
                              {ownerDisplayName(
                                row.booking.owners?.first_name,
                                row.booking.owners?.last_name,
                              )}{" "}
                              · {row.booking.check_in_date} → {row.booking.check_out_date}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {row.booking.do_not_move && (
                              <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">
                                DNM
                              </Badge>
                            )}
                            {row.movedToday && (
                              <Badge variant="outline" className="text-[10px]">
                                Moved today
                              </Badge>
                            )}
                            {label !== formatRoomSectionLabel(room!) && room && (
                              <Badge variant="secondary" className="text-[10px]">
                                Seg: {label}
                              </Badge>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid={`boarding-shuffle-move-${row.booking.id}`}
                            onClick={() => setMoveTarget(row)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                            Move
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <aside className="rounded-lg border bg-muted/20 p-3 space-y-2 h-fit">
            <h3 className="text-sm font-semibold flex items-center gap-1">
              Pending / unassigned
              {unassigned.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {unassigned.length}
                </Badge>
              )}
            </h3>
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unassigned stays on this day.</p>
            ) : (
              <ul className="space-y-2">
                {unassigned.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-md border bg-card px-2 py-2 text-sm"
                    data-testid={`boarding-shuffle-unassigned-${b.id}`}
                  >
                    <p className="font-medium">{petNames(b)}</p>
                    <p className="text-xs text-muted-foreground">
                      {ownerDisplayName(b.owners?.first_name, b.owners?.last_name)}
                    </p>
                    {b.do_not_move && (
                      <Badge variant="outline" className="mt-1 text-[10px] bg-orange-100 text-orange-800">
                        DNM
                      </Badge>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() =>
                        setMoveTarget({
                          booking: b,
                          roomId: b.room_id ?? "",
                          slices: sortedAssignmentSlices(
                            (assignmentsByBooking.get(b.id) ?? []).map((a) => ({
                              start_date: a.start_date,
                              end_date: a.end_date,
                              rooms: a.rooms,
                            })),
                          ),
                          movedToday: false,
                        })
                      }
                    >
                      Assign / move
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {moveTarget && (
        <ChangeRoomDialog
          open={!!moveTarget}
          onOpenChange={(o) => {
            if (!o) setMoveTarget(null);
          }}
          booking={moveTarget.booking}
          assignmentSlices={moveTarget.slices}
          facilityRooms={assignableRooms}
          defaultEffectiveDate={shuffleDate}
          onMoved={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}
