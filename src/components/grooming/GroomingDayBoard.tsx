import { useMemo, useState } from "react";
import { addDays, format, parse, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { GroomingConflictOverrideDialog } from "@/components/grooming/GroomingConflictOverrideDialog";
import type { GroomingScheduleConflict } from "@/lib/groomingCalendarModel";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import {
  GroomingScheduleNeedsOverrideError,
  useGroomingDayBoard,
  useGroomDefaultMinutes,
  useScheduleGroomingAppt,
} from "@/hooks/useGroomingCapacity";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 18 * 60;
const ROW_HEIGHT = 48;

type GroomingRow = Database["public"]["Tables"]["grooming_appointments"]["Row"];

type Props = {
  initialDate?: string;
  staffLabel?: string;
  onAppointmentClick?: (row: GroomingRow) => void;
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

function blockStyle(startMin: number, durationMin: number) {
  const top = ((startMin - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100;
  const height = (durationMin / (DAY_END_MIN - DAY_START_MIN)) * 100;
  return { top: `${Math.max(0, top)}%`, height: `${Math.min(100, height)}%` };
}

export function GroomingDayBoard({ initialDate, staffLabel = "staff", onAppointmentClick }: Props) {
  const [date, setDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideConflicts, setOverrideConflicts] = useState<GroomingScheduleConflict[]>([]);
  const [pendingRow, setPendingRow] = useState<GroomingRow | null>(null);

  const { data, isLoading } = useGroomingDayBoard(date);
  const schedule = useScheduleGroomingAppt();

  const { pinnedByStation, floating } = useMemo(() => {
    const appts = data?.appts ?? [];
    const pinned = new Map<string, GroomingRow[]>();
    const float: GroomingRow[] = [];
    for (const a of appts) {
      if (a.status === "cancelled" || a.no_show) continue;
      if (a.appointment_time && a.station_id) {
        const list = pinned.get(a.station_id) ?? [];
        list.push(a);
        pinned.set(a.station_id, list);
      } else if (!a.appointment_time && a.booking_id) {
        float.push(a);
      }
    }
    return { pinnedByStation: pinned, floating: float };
  }, [data?.appts]);

  const cap = data?.capacity;

  const saveWithOverride = async (row: GroomingRow, overrideReason?: string) => {
    try {
      await schedule.mutateAsync({
        ...row,
        staff: staffLabel,
        overrideReason,
      });
      toast.success("Appointment saved");
      setOverrideOpen(false);
      setPendingRow(null);
    } catch (err) {
      if (err instanceof GroomingScheduleNeedsOverrideError) {
        setPendingRow(row);
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
  };

  const placeFloating = (appt: GroomingRow, stationId: string, time: string) => {
    void saveWithOverride({
      ...appt,
      station_id: stationId,
      appointment_time: time,
    });
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
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 text-xs",
              !cap.feasible && "text-amber-800",
            )}
          >
            <span className="rounded-full border px-2 py-0.5 tabular-nums">
              {cap.committed_minutes}/{cap.total_minutes} min
            </span>
            <span className="text-muted-foreground">
              pinned {cap.pinned_minutes} · floating {cap.floating_minutes}
            </span>
            {!cap.feasible && (
              <span className="flex items-center gap-1">
                <TriangleAlert className="h-3.5 w-3.5" />
                Over daily budget
              </span>
            )}
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
                  {st.used_minutes}/{st.window_minutes} min
                </div>
              </div>
            ))}

            <div className="relative border-r bg-muted/20" style={{ height: ROW_HEIGHT * 10 }}>
              {[8, 10, 12, 14, 16].map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/50 text-[10px] text-muted-foreground pl-1"
                  style={{ top: `${((h * 60 - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100}%` }}
                >
                  {h}:00
                </div>
              ))}
            </div>

            {(data?.stations ?? []).map((st) => (
              <div
                key={st.station_id}
                className="relative border-l"
                style={{ height: ROW_HEIGHT * 10 }}
              >
                {(pinnedByStation.get(st.station_id) ?? []).map((a) => {
                  const start = timeToMinutes(a.appointment_time);
                  if (start == null) return null;
                  const style = blockStyle(start, a.duration_minutes);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border border-primary/30 bg-primary/15 px-1 py-0.5 text-left text-[10px] hover:bg-primary/25"
                      style={style}
                      onClick={() => onAppointmentClick?.(a)}
                    >
                      <div className="font-medium truncate">{a.pet_id.slice(0, 8)}</div>
                      <div className="truncate opacity-80">
                        {labelForGroomingService(a.service)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Floating (on stay, no time yet)</h3>
        {floating.length === 0 ? (
          <p className="text-xs text-muted-foreground">No floating grooming jobs.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {floating.map((a) => (
              <FloatingCard
                key={a.id}
                appt={a}
                stations={data?.stations ?? []}
                onPlace={placeFloating}
                onOpen={() => onAppointmentClick?.(a)}
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
          if (!pendingRow) return;
          void saveWithOverride(pendingRow, reason);
        }}
      />
    </div>
  );
}

function FloatingCard({
  appt,
  stations,
  onPlace,
  onOpen,
}: {
  appt: GroomingRow;
  stations: { station_id: string; station_name: string }[];
  onPlace: (appt: GroomingRow, stationId: string, time: string) => void;
  onOpen: () => void;
}) {
  const [stationId, setStationId] = useState(stations[0]?.station_id ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(appt.duration_minutes);
  const defaultDur = useGroomDefaultMinutes(appt.service, "medium");

  return (
    <li className="rounded-lg border bg-card p-3 text-sm space-y-2">
      <button type="button" className="font-medium text-left hover:underline" onClick={onOpen}>
        {labelForGroomingService(appt.service)}
      </button>
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
          onClick={() =>
            onPlace({ ...appt, duration_minutes: duration }, stationId, `${time}:00`)
          }
        >
          Place
        </Button>
      </div>
      <Badge variant="outline" className="text-[10px]">
        Linked booking
      </Badge>
    </li>
  );
}
