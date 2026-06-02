import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parse, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { GroomingConflictOverrideDialog } from "@/components/grooming/GroomingConflictOverrideDialog";
import type { GroomingScheduleConflict } from "@/lib/groomingCalendarModel";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import {
  GroomingScheduleNeedsOverrideError,
  useGroomingDay,
  useGroomDefaultMinutes,
  useScheduleGroomingAppt,
  type GroomingBacklogRow,
  type GroomingPinnedAppt,
  type ScheduleGroomingApptInput,
} from "@/hooks/useGroomingCapacity";
import { useStaff } from "@/hooks/useStaff";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 18 * 60;
const TIMELINE_HEIGHT = 480;
const DRAG_MIME = "application/x-woof-grooming-appt";

type Props = {
  initialDate?: string;
  staffLabel?: string;
  onAppointmentClick?: (apptId: string) => void;
};

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const slice = t.length >= 8 ? t.slice(0, 8) : `${t}:00`.slice(0, 8);
  try {
    const d = parse(slice, "HH:mm:ss", new Date(2000, 0, 1));
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return null;
  }
}

function minutesToTimeString(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function snapMinutes(min: number): number {
  const snapped = Math.round(min / 15) * 15;
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - 15, snapped));
}

function minutesFromTimelineY(clientY: number, rect: DOMRect): number {
  const pct = (clientY - rect.top) / rect.height;
  const raw = DAY_START_MIN + pct * (DAY_END_MIN - DAY_START_MIN);
  return snapMinutes(raw);
}

function blockStyle(startMin: number, durationMin: number) {
  const top = ((startMin - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100;
  const height = (durationMin / (DAY_END_MIN - DAY_START_MIN)) * 100;
  return { top: `${Math.max(0, top)}%`, height: `${Math.max(2, Math.min(100, height))}%` };
}

function toScheduleInput(
  date: string,
  fields: ScheduleGroomingApptInput,
): ScheduleGroomingApptInput {
  return { ...fields, appointment_date: date };
}

export function GroomingDayBoard({ initialDate, staffLabel = "staff", onAppointmentClick }: Props) {
  const [date, setDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [placedSession, setPlacedSession] = useState(0);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideConflicts, setOverrideConflicts] = useState<GroomingScheduleConflict[]>([]);
  const [pendingSave, setPendingSave] = useState<ScheduleGroomingApptInput | null>(null);

  const { data, isLoading } = useGroomingDay(date);
  const schedule = useScheduleGroomingAppt();
  const { data: staffRows = [] } = useStaff();

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  const pinnedByStation = useMemo(() => {
    const pinned = new Map<string, GroomingPinnedAppt[]>();
    for (const a of data?.pinned ?? []) {
      if (a.status === "cancelled" || a.no_show || !a.station_id || !a.appointment_time) continue;
      const list = pinned.get(a.station_id) ?? [];
      list.push(a);
      pinned.set(a.station_id, list);
    }
    return pinned;
  }, [data?.pinned]);

  const cap = data?.capacity;
  const meterPct =
    cap && cap.total_minutes > 0
      ? Math.min(100, (cap.committed_minutes / cap.total_minutes) * 100)
      : 0;
  const overBudget = cap != null && cap.committed_minutes > cap.total_minutes;

  const saveAppt = useCallback(
    async (input: ScheduleGroomingApptInput, opts?: { countPlaced?: boolean }) => {
      try {
        await schedule.mutateAsync(toScheduleInput(date, { ...input, staff: staffLabel }));
        if (opts?.countPlaced) setPlacedSession((n) => n + 1);
        toast.success("Appointment saved");
        setOverrideOpen(false);
        setPendingSave(null);
      } catch (err) {
        if (err instanceof GroomingScheduleNeedsOverrideError) {
          setPendingSave(input);
          setOverrideConflicts(
            err.warnings.map((w, i) => ({
              conflictType: "appointment_overlap" as const,
              conflictedWithId: `warn-${i}`,
              label: w.msg,
            })),
          );
          setOverrideOpen(true);
          return;
        }
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    },
    [date, schedule, staffLabel],
  );

  const placeBacklog = (
    row: GroomingBacklogRow,
    stationId: string,
    time: string,
    duration: number,
    groomerId: string | null,
  ) => {
    void saveAppt(
      {
        id: row.appt_id,
        pet_id: row.pet_id,
        owner_id: row.owner_id,
        service: row.service,
        appointment_date: date,
        station_id: stationId,
        appointment_time: time,
        duration_minutes: duration,
        groomer_id: groomerId,
      },
      { countPlaced: true },
    );
  };

  const onLaneDrop = (e: React.DragEvent, stationId: string) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    let payload: { apptId: string; duration: number; groomerId: string | null };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return;
    }
    const row = data?.backlog.find((b) => b.appt_id === payload.apptId);
    if (!row) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startMin = minutesFromTimelineY(e.clientY, rect);
    placeBacklog(row, stationId, minutesToTimeString(startMin), payload.duration, payload.groomerId);
  };

  return (
    <div className="space-y-4 p-4" data-testid="grooming-day-board">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setDate(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          className="rounded-md border px-2 py-1 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="grooming-day-board-date"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {isLoading ? (
          <Skeleton className="h-6 w-56" />
        ) : cap ? (
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1 max-w-md">
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 text-xs",
                (overBudget || !cap.feasible) && "text-amber-900",
              )}
              data-testid="grooming-day-board-meter"
            >
              <span className="tabular-nums font-medium">
                {cap.committed_minutes}/{cap.total_minutes} min
              </span>
              <span className="text-muted-foreground">
                pinned {cap.pinned_minutes} · floating {cap.floating_minutes}
              </span>
              <span className="text-muted-foreground">
                Placed this session · {placedSession}
              </span>
              {(overBudget || !cap.feasible) && (
                <span className="flex items-center gap-1">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Over daily budget
                </span>
              )}
            </div>
            <Progress
              value={meterPct}
              className="h-2"
              indicatorClassName={cn(overBudget && "bg-amber-500")}
            />
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: `4rem repeat(${data?.stations.length ?? 0}, minmax(8rem, 1fr))`,
            }}
          >
            <div className="border-b bg-muted/40 p-2 text-xs text-muted-foreground">Time</div>
            {(data?.stations ?? []).map((st) => (
              <div key={st.station_id} className="border-b border-l p-2 text-sm font-medium">
                {st.station_name}
                <div className="text-[10px] font-normal text-muted-foreground tabular-nums">
                  {st.used_minutes}/{st.window_minutes} min free
                </div>
              </div>
            ))}

            <div
              className="relative border-r bg-muted/20"
              style={{ height: TIMELINE_HEIGHT }}
            >
              {[8, 10, 12, 14, 16, 18].map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/50 text-[10px] text-muted-foreground pl-1"
                  style={{
                    top: `${((h * 60 - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100}%`,
                  }}
                >
                  {h === 18 ? "18:00" : `${h}:00`}
                </div>
              ))}
            </div>

            {(data?.stations ?? []).map((st) => (
              <div
                key={st.station_id}
                className="relative border-l bg-muted/5"
                style={{ height: TIMELINE_HEIGHT }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onLaneDrop(e, st.station_id)}
                data-testid={`grooming-day-board-lane-${st.station_id}`}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-30"
                  aria-hidden
                >
                  {[8, 10, 12, 14, 16].map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-dashed border-border/40"
                      style={{
                        top: `${((h * 60 - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100}%`,
                      }}
                    />
                  ))}
                </div>

                {(pinnedByStation.get(st.station_id) ?? []).map((a) => (
                  <PinnedBlock
                    key={a.id}
                    appt={a}
                    onSave={saveAppt}
                    onOpen={() => onAppointmentClick?.(a.id)}
                    isSaving={schedule.isPending}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Floating backlog
          <span className="ml-2 font-normal text-muted-foreground">
            ({data?.backlog.length ?? 0} to place)
          </span>
        </h3>
        {(data?.backlog.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No floating grooming jobs for this day.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.backlog ?? []).map((row) => (
              <FloatingBacklogCard
                key={row.appt_id}
                row={row}
                stations={data?.stations ?? []}
                staffRows={staffRows}
                onPlace={placeBacklog}
                onOpen={() => onAppointmentClick?.(row.appt_id)}
              />
            ))}
          </ul>
        )}
      </section>

      <GroomingConflictOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        conflicts={overrideConflicts}
        isPending={schedule.isPending}
        onConfirm={(reason) => {
          if (!pendingSave) return;
          void saveAppt({ ...pendingSave, overrideReason: reason });
        }}
      />
    </div>
  );
}

function PinnedBlock({
  appt,
  onSave,
  onOpen,
  isSaving,
}: {
  appt: GroomingPinnedAppt;
  onSave: (input: ScheduleGroomingApptInput) => void;
  onOpen: () => void;
  isSaving: boolean;
}) {
  const [duration, setDuration] = useState(appt.duration_minutes ?? 45);
  const start = timeToMinutes(appt.appointment_time);
  if (start == null || !appt.station_id) return null;

  const persistDuration = () => {
    if (duration === appt.duration_minutes) return;
    onSave({
      id: appt.id,
      pet_id: appt.pet_id,
      owner_id: appt.owner_id,
      service: appt.service,
      appointment_date: appt.appointment_date,
      station_id: appt.station_id,
      appointment_time: appt.appointment_time,
      duration_minutes: duration,
      groomer_id: appt.groomer_id,
    });
  };

  const style = blockStyle(start, duration);

  return (
    <div
      className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border border-primary/30 bg-primary/15 px-1 py-0.5 text-left text-[10px] hover:bg-primary/25"
      style={style}
    >
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="font-medium truncate">{appt.pets?.name ?? "Pet"}</div>
        <div className="truncate opacity-80">{labelForGroomingService(appt.service)}</div>
      </button>
      <div className="mt-0.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          type="number"
          className="h-5 w-12 px-1 text-[10px]"
          value={duration}
          disabled={isSaving}
          onChange={(e) => setDuration(Number(e.target.value) || 45)}
          onBlur={persistDuration}
          onKeyDown={(e) => {
            if (e.key === "Enter") persistDuration();
          }}
          aria-label="Duration minutes"
        />
        <span className="text-[9px] text-muted-foreground">min</span>
      </div>
    </div>
  );
}

function FloatingBacklogCard({
  row,
  stations,
  staffRows,
  onPlace,
  onOpen,
}: {
  row: GroomingBacklogRow;
  stations: { station_id: string; station_name: string }[];
  staffRows: { id: string; first_name: string; last_name: string }[];
  onPlace: (
    row: GroomingBacklogRow,
    stationId: string,
    time: string,
    duration: number,
    groomerId: string | null,
  ) => void;
  onOpen: () => void;
}) {
  const petSize = row.pet_size ?? "medium";
  const defaultDur = useGroomDefaultMinutes(row.service, petSize);
  const [stationId, setStationId] = useState(stations[0]?.station_id ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(row.duration_minutes);
  const [groomerId, setGroomerId] = useState<string>("");

  useEffect(() => {
    if (defaultDur.data != null && row.duration_minutes === defaultDur.data) {
      setDuration(defaultDur.data);
    }
  }, [defaultDur.data, row.duration_minutes]);

  useEffect(() => {
    setDuration(row.duration_minutes);
  }, [row.duration_minutes]);

  const dragPayload = JSON.stringify({
    apptId: row.appt_id,
    duration,
    groomerId: groomerId || null,
  });

  return (
    <li
      className="rounded-lg border bg-card p-3 text-sm space-y-2 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, dragPayload);
        e.dataTransfer.effectAllowed = "move";
      }}
      data-testid={`grooming-day-board-backlog-${row.appt_id}`}
    >
      <button type="button" className="font-medium text-left hover:underline w-full" onClick={onOpen}>
        {row.dog_name ?? "Pet"} · {labelForGroomingService(row.service)}
      </button>
      {row.booking_ref ? (
        <p className="text-[10px] text-muted-foreground">Stay {row.booking_ref}</p>
      ) : row.source_booking_id ? (
        <Badge variant="outline" className="text-[10px]">
          Linked booking
        </Badge>
      ) : null}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label className="text-[10px]">Duration (min)</Label>
          <Input
            type="number"
            className="h-8 w-20"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || defaultDur.data || 45)}
          />
        </div>
        <div>
          <Label className="text-[10px]">Groomer</Label>
          <select
            className="h-8 max-w-[8rem] rounded border px-2 text-xs truncate"
            value={groomerId}
            onChange={(e) => setGroomerId(e.target.value)}
          >
            <option value="">—</option>
            {staffRows.map((s) => (
              <option key={s.id} value={s.id}>
                {[s.first_name, s.last_name].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px]">Station</Label>
          <select
            className="h-8 rounded border px-2 text-xs"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            {stations.map((s) => (
              <option key={s.station_id} value={s.station_id}>
                {s.station_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px]">Time</Label>
          <Input
            type="time"
            className="h-8"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          data-testid="grooming-day-board-place-btn"
          disabled={!stationId}
          onClick={() =>
            onPlace(row, stationId, `${time}:00`, duration, groomerId || null)
          }
        >
          Place
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Or drag onto a station lane</p>
    </li>
  );
}
