import { useCallback, useMemo } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import { normalizeGroomingWorkflowStatus } from "@/lib/groomingWorkflow";
import type { GroomingAppointmentWithJoins } from "@/hooks/useGrooming";
import type { GroomingStationBlockRow, GroomingStationRow } from "@/hooks/useGroomingStations";
import {
  GROOMING_GRID_END_MINUTES,
  GROOMING_GRID_ROW_COUNT,
  GROOMING_GRID_START_MINUTES,
  GROOMING_SLOT_MINUTES,
  UNASSIGNED_STATION_ID,
  appointmentDurationMinutes,
  appointmentTimeRange,
  blockHeightPx,
  blockTimeRange,
  blockTopPx,
  formatGridTimeLabel,
  isAppointmentPastGridEnd,
  isSlotBlocked,
  minutesFromGridClick,
  minutesToHHMM,
  slotOverlapsAppointment,
} from "@/lib/groomingCalendarModel";

const ROW_HEIGHT_PX = 36;
const GRID_HEIGHT_PX = GROOMING_GRID_ROW_COUNT * ROW_HEIGHT_PX;
const COLUMN_MIN_WIDTH_PX = 148;

export type GroomingStationCalendarProps = {
  stations: GroomingStationRow[];
  blocks: GroomingStationBlockRow[];
  appointments: GroomingAppointmentWithJoins[];
  hiddenByFilterCount: number;
  stationsUnavailable?: boolean;
  onEmptySlotClick: (stationId: string, timeHHMM: string) => void;
  onAppointmentClick: (appointment: GroomingAppointmentWithJoins) => void;
  onBlockClick: (block: GroomingStationBlockRow) => void;
  onRequestBlockStation: (stationId: string, slotTimeHHMM?: string) => void;
};

function parseServiceExtras(notes: string | null): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .filter((line) => line.toLowerCase().trimStart().startsWith("services:"))
    .flatMap((line) =>
      line
        .replace(/^services:\s*/i, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
}

function appointmentServiceLine(a: GroomingAppointmentWithJoins): string {
  const primary = labelForGroomingService(a.service);
  const extras = parseServiceExtras(a.notes).filter(
    (s) => s.toLowerCase() !== primary.toLowerCase(),
  );
  if (extras.length === 0) return primary;
  return `${primary} +${extras.length}`;
}

function AppointmentBlock({
  appt,
  onClick,
}: {
  appt: GroomingAppointmentWithJoins;
  onClick: () => void;
}) {
  const range = appointmentTimeRange(appt.appointment_time, appt.duration_minutes);
  if (!range) return null;
  const duration = appointmentDurationMinutes(appt.duration_minutes);
  const top = blockTopPx(range.start, ROW_HEIGHT_PX);
  const height = blockHeightPx(duration, ROW_HEIGHT_PX);
  const pastEnd = isAppointmentPastGridEnd(appt.appointment_time, appt.duration_minutes);
  const needsStation = !appt.station_id;

  return (
    <button
      type="button"
      data-testid={`grooming-calendar-appt-${appt.id}`}
      className={cn(
        "absolute inset-x-0.5 z-30 overflow-hidden rounded border p-1 text-left text-[10px] shadow-sm",
        needsStation
          ? "border-amber-400/60 bg-amber-50 hover:bg-amber-100/80"
          : "border-primary/30 bg-primary/10 hover:bg-primary/15",
        pastEnd && "border-amber-500 bg-amber-50",
      )}
      style={{ top, height: Math.max(height, 28) }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <p className="font-semibold truncate leading-tight">{appt.pets?.name ?? "—"}</p>
      <p className="truncate text-muted-foreground leading-tight">
        {appt.owners
          ? ownerDisplayName(appt.owners.first_name, appt.owners.last_name)
          : "—"}
      </p>
      <p className="truncate leading-tight">{appointmentServiceLine(appt)}</p>
      <p className="truncate leading-tight">{appt.grooming_notes?.trim() || "No groomer"}</p>
      {needsStation ? (
        <p className="text-[9px] font-medium text-amber-800">No station</p>
      ) : null}
      {pastEnd ? <p className="text-[9px] font-medium text-amber-800">Past 7 PM</p> : null}
    </button>
  );
}

type CalendarColumn =
  | { kind: "station"; station: GroomingStationRow }
  | { kind: "unassigned"; id: typeof UNASSIGNED_STATION_ID };

export function GroomingStationCalendar({
  stations,
  blocks,
  appointments,
  hiddenByFilterCount,
  stationsUnavailable = false,
  onEmptySlotClick,
  onAppointmentClick,
  onBlockClick,
  onRequestBlockStation,
}: GroomingStationCalendarProps) {
  const columns: CalendarColumn[] = useMemo(
    () => [
      ...stations.map((station) => ({ kind: "station" as const, station })),
      { kind: "unassigned", id: UNASSIGNED_STATION_ID },
    ],
    [stations],
  );

  const activeAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => normalizeGroomingWorkflowStatus(a.status) !== "cancelled",
      ),
    [appointments],
  );

  const { byStation, unassignedTimed, unassignedNoTime } = useMemo(() => {
    const byStationMap = new Map<string, GroomingAppointmentWithJoins[]>();
    for (const col of columns) {
      if (col.kind === "station") byStationMap.set(col.station.id, []);
    }
    const timedUnassigned: GroomingAppointmentWithJoins[] = [];
    const noTimeUnassigned: GroomingAppointmentWithJoins[] = [];

    for (const appt of activeAppointments) {
      const hasTime = !!appt.appointment_time;
      if (appt.station_id && hasTime) {
        const list = byStationMap.get(appt.station_id) ?? [];
        list.push(appt);
        byStationMap.set(appt.station_id, list);
      } else if (hasTime) {
        timedUnassigned.push(appt);
      } else {
        noTimeUnassigned.push(appt);
      }
    }

    return {
      byStation: byStationMap,
      unassignedTimed: timedUnassigned,
      unassignedNoTime: noTimeUnassigned,
    };
  }, [activeAppointments, columns]);

  const blocksByStation = useMemo(() => {
    const map = new Map<string, GroomingStationBlockRow[]>();
    for (const block of blocks) {
      const list = map.get(block.station_id) ?? [];
      list.push(block);
      map.set(block.station_id, list);
    }
    return map;
  }, [blocks]);

  const slotStarts = useMemo(() => {
    const out: number[] = [];
    for (
      let m = GROOMING_GRID_START_MINUTES;
      m < GROOMING_GRID_END_MINUTES;
      m += GROOMING_SLOT_MINUTES
    ) {
      out.push(m);
    }
    return out;
  }, []);

  const timeLabels = useMemo(
    () =>
      slotStarts.map((minutes) => ({
        minutes,
        label: formatGridTimeLabel(minutes),
      })),
    [slotStarts],
  );

  const handleColumnClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      columnId: string,
      columnAppointments: GroomingAppointmentWithJoins[],
    ) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const slotStart = minutesFromGridClick(e.clientY - rect.top, ROW_HEIGHT_PX);
      if (slotStart == null) return;
      if (isSlotBlocked({ stationId: columnId, slotStartMinutes: slotStart, blocks })) return;
      const blockedByAppt = columnAppointments.some((appt) =>
        slotOverlapsAppointment({
          slotStartMinutes: slotStart,
          appointmentTime: appt.appointment_time,
          durationMinutes: appt.duration_minutes,
        }),
      );
      if (blockedByAppt) return;
      onEmptySlotClick(columnId, minutesToHHMM(slotStart));
    },
    [blocks, onEmptySlotClick],
  );

  const renderTimeGrid = (
    columnId: string,
    columnAppointments: GroomingAppointmentWithJoins[],
    columnBlocks: GroomingStationBlockRow[],
    options?: { allowBooking?: boolean },
  ) => {
    const allowBooking = options?.allowBooking ?? true;

    const gridBody = (
      <div
        className={cn(
          "relative",
          allowBooking && "cursor-pointer",
        )}
        style={{ height: GRID_HEIGHT_PX }}
        data-testid={`grooming-calendar-column-${columnId}`}
        onClick={
          allowBooking
            ? (e) => handleColumnClick(e, columnId, columnAppointments)
            : undefined
        }
      >
        {slotStarts.map((minutes) => (
          <div
            key={minutes}
            className="pointer-events-none absolute inset-x-0 border-b border-border/50"
            style={{ top: blockTopPx(minutes, ROW_HEIGHT_PX), height: ROW_HEIGHT_PX }}
          />
        ))}

        {columnBlocks.map((block) => {
          const range = blockTimeRange(block);
          const top = blockTopPx(range.start, ROW_HEIGHT_PX);
          const height = blockHeightPx(range.end - range.start, ROW_HEIGHT_PX);
          return (
            <button
              key={block.id}
              type="button"
              data-testid={`grooming-calendar-block-${block.id}`}
              className="absolute inset-x-0.5 z-20 overflow-hidden rounded border border-dashed border-muted-foreground/50 bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(0,0,0,0.06)_4px,rgba(0,0,0,0.06)_8px)] p-1 text-left text-[10px] text-muted-foreground hover:ring-1 hover:ring-ring"
              style={{ top, height: Math.max(height, 18) }}
              title={block.reason}
              onClick={(ev) => {
                ev.stopPropagation();
                onBlockClick(block);
              }}
            >
              <span className="line-clamp-3 font-medium">{block.reason || "Blocked"}</span>
            </button>
          );
        })}

        {columnAppointments.map((appt) => (
          <AppointmentBlock
            key={appt.id}
            appt={appt}
            onClick={() => onAppointmentClick(appt)}
          />
        ))}
      </div>
    );

    return gridBody;
  };

  return (
    <div className="space-y-2" data-testid="grooming-station-calendar">
      <p className="text-xs text-muted-foreground">
        Click an empty slot to book · Use Block on a station header to mark unavailable · Click a
        hatched block to unblock
      </p>

      {stationsUnavailable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Grooming stations could not be loaded. Refresh the page — if this persists, check the
          database connection.
        </p>
      ) : null}

      {hiddenByFilterCount > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {hiddenByFilterCount} appointment{hiddenByFilterCount === 1 ? "" : "s"} hidden by service
          filter. Some time slots may already be booked.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border bg-background">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r bg-muted/30">
            <div className="h-10 border-b" />
            <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
              {timeLabels.map(({ minutes, label }) => (
                <div
                  key={minutes}
                  className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: blockTopPx(minutes, ROW_HEIGHT_PX) - 6 }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {columns.map((col) => {
            const columnId = col.kind === "station" ? col.station.id : UNASSIGNED_STATION_ID;
            const columnName = col.kind === "station" ? col.station.name : "Unassigned";
            const isUnassigned = col.kind === "unassigned";
            const columnAppointments = isUnassigned
              ? unassignedTimed
              : byStation.get(columnId) ?? [];
            const columnBlocks = isUnassigned ? [] : blocksByStation.get(columnId) ?? [];

            const stationSortOrder =
              col.kind === "station" ? col.station.sort_order : null;

            return (
              <div
                key={columnId}
                className="shrink-0 border-r last:border-r-0"
                style={{ minWidth: COLUMN_MIN_WIDTH_PX }}
              >
                <div
                  className={cn(
                    "flex h-10 items-center justify-between gap-1 border-b px-1.5",
                    isUnassigned && "justify-center text-muted-foreground",
                  )}
                >
                  <span className="truncate text-xs font-semibold">{columnName}</span>
                  {!isUnassigned && stationSortOrder != null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      data-testid={`grooming-station-block-btn-${stationSortOrder}`}
                      onClick={() => onRequestBlockStation(columnId)}
                    >
                      <Ban className="mr-0.5 h-3 w-3" />
                      Block
                    </Button>
                  ) : null}
                </div>

                {isUnassigned && unassignedNoTime.length > 0 ? (
                  <div className="space-y-1 border-b bg-muted/20 p-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      No time set
                    </p>
                    {unassignedNoTime.map((appt) => (
                      <button
                        key={appt.id}
                        type="button"
                        className="w-full rounded-md border bg-card p-2 text-left text-xs shadow-sm hover:bg-accent/40"
                        onClick={() => onAppointmentClick(appt)}
                      >
                        <p className="font-semibold truncate">{appt.pets?.name ?? "—"}</p>
                        <p className="text-muted-foreground truncate">
                          {appt.owners
                            ? ownerDisplayName(
                                appt.owners.first_name,
                                appt.owners.last_name,
                              )
                            : "—"}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : null}

                {renderTimeGrid(columnId, columnAppointments, columnBlocks, {
                  allowBooking: !isUnassigned,
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
