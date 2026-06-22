import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGroomingGroomers } from "@/hooks/useGroomingGroomers";
import { useGroomingStations } from "@/hooks/useGroomingStations";
import {
  useAddGroomerLeavePeriod,
  useAllGroomingGroomerLeavePeriods,
  useGroomingGroomerWeeklyDaysOff,
  useGroomingStationWeeklyAssignments,
  useRemoveGroomerLeavePeriod,
  useToggleGroomingGroomerWeeklyOff,
  useUpsertGroomingStationWeeklyAssignment,
} from "@/hooks/useGroomingStationGroomerSchedule";
import {
  countGroomerWeeklyOffDays,
  GROOMING_WEEKDAY_LABELS,
  MAX_GROOMER_WEEKLY_DAYS_OFF,
} from "@/lib/groomingStationGroomerSchedule";
import { toast } from "sonner";

/** Display order Mon–Sun; values are Postgres dow (0=Sun … 6=Sat). */
const WEEKDAY_COLUMNS: { dow: number; label: string }[] = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

const UNASSIGNED = "__unassigned__";

function formatLeaveRange(start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  if (s === e) return format(parseISO(s), "d MMM yyyy");
  return `${format(parseISO(s), "d MMM")} – ${format(parseISO(e), "d MMM yyyy")}`;
}

export function GroomingStationSchedulePanel() {
  const { data: stations = [], isLoading: stationsLoading } = useGroomingStations();
  const { data: groomers = [], isLoading: groomersLoading } = useGroomingGroomers();
  const { data: weekly = [], isLoading: weeklyLoading } = useGroomingStationWeeklyAssignments();
  const { data: weeklyOff = [], isLoading: weeklyOffLoading } = useGroomingGroomerWeeklyDaysOff();
  const { data: leavePeriods = [], isLoading: leaveLoading } = useAllGroomingGroomerLeavePeriods();
  const upsertWeekly = useUpsertGroomingStationWeeklyAssignment();
  const toggleWeeklyOff = useToggleGroomingGroomerWeeklyOff();
  const addLeave = useAddGroomerLeavePeriod();
  const removeLeave = useRemoveGroomerLeavePeriod();

  const [leaveGroomerId, setLeaveGroomerId] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveNote, setLeaveNote] = useState("");

  const weeklyByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of weekly) {
      map.set(`${row.station_id}:${row.day_of_week}`, row.groomer_id);
    }
    return map;
  }, [weekly]);

  const weeklyOffSet = useMemo(() => {
    const set = new Set<string>();
    for (const row of weeklyOff) {
      set.add(`${row.groomer_id}:${row.day_of_week}`);
    }
    return set;
  }, [weeklyOff]);

  const isLoading = stationsLoading || groomersLoading || weeklyLoading || weeklyOffLoading;

  const handleWeeklyChange = (stationId: string, dayOfWeek: number, value: string) => {
    upsertWeekly.mutate(
      {
        station_id: stationId,
        day_of_week: dayOfWeek,
        groomer_id: value === UNASSIGNED ? null : value,
      },
      {
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save station assignment."),
      },
    );
  };

  const handleWeeklyOffToggle = (groomerId: string, dayOfWeek: number, checked: boolean) => {
    if (checked) {
      const count = countGroomerWeeklyOffDays(
        groomerId,
        weeklyOff.map((w) => ({ groomer_id: w.groomer_id, day_of_week: w.day_of_week })),
      );
      if (count >= MAX_GROOMER_WEEKLY_DAYS_OFF) {
        toast.error(`Each groomer can have at most ${MAX_GROOMER_WEEKLY_DAYS_OFF} regular days off per week.`);
        return;
      }
    }
    toggleWeeklyOff.mutate(
      { groomer_id: groomerId, day_of_week: dayOfWeek, enabled: checked },
      {
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not update weekly day off."),
      },
    );
  };

  const handleAddLeave = () => {
    if (!leaveGroomerId) {
      toast.error("Select a groomer.");
      return;
    }
    if (!leaveStart || !leaveEnd) {
      toast.error("Select start and end dates.");
      return;
    }
    addLeave.mutate(
      {
        groomer_id: leaveGroomerId,
        start_date: leaveStart,
        end_date: leaveEnd,
        note: leaveNote || null,
      },
      {
        onSuccess: () => {
          toast.success("Leave saved.");
          setLeaveStart("");
          setLeaveEnd("");
          setLeaveNote("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save leave."),
      },
    );
  };

  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-6"
      data-testid="grooming-station-schedule-panel"
    >
      <div>
        <h3 className="text-sm font-semibold">Station schedule</h3>
        <p className="text-xs text-muted-foreground">
          Default station groomers by weekday. Regular weekly days off and leave periods leave a
          station unassigned on those dates.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading schedule…
        </p>
      ) : stations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active stations configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium text-muted-foreground">Station</th>
                {WEEKDAY_COLUMNS.map((col) => (
                  <th key={col.dow} className="px-1 py-2 text-center font-medium text-muted-foreground">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{station.name}</td>
                  {WEEKDAY_COLUMNS.map((col) => {
                    const cellKey = `${station.id}:${col.dow}`;
                    const current = weeklyByCell.get(cellKey) ?? UNASSIGNED;
                    return (
                      <td key={col.dow} className="px-1 py-2">
                        <Select
                          value={current}
                          onValueChange={(v) => handleWeeklyChange(station.id, col.dow, v)}
                          disabled={upsertWeekly.isPending || groomers.length === 0}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                            {groomers.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 border-t pt-4">
        <div>
          <h4 className="text-sm font-semibold">Regular weekly days off</h4>
          <p className="text-xs text-muted-foreground">
            Tick up to {MAX_GROOMER_WEEKLY_DAYS_OFF} weekdays each groomer is normally off (e.g.
            Sat &amp; Sun). Applies every week — no dates needed.
          </p>
        </div>

        {groomers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Add groomers above first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3 text-left font-medium text-muted-foreground">Groomer</th>
                  {WEEKDAY_COLUMNS.map((col) => (
                    <th key={col.dow} className="px-1 py-2 text-center font-medium text-muted-foreground">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groomers.map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{g.name}</td>
                    {WEEKDAY_COLUMNS.map((col) => {
                      const checked = weeklyOffSet.has(`${g.id}:${col.dow}`);
                      return (
                        <td key={col.dow} className="px-1 py-2 text-center">
                          <Checkbox
                            checked={checked}
                            disabled={toggleWeeklyOff.isPending || g.id.startsWith("fallback-")}
                            aria-label={`${g.name} off on ${GROOMING_WEEKDAY_LABELS[col.dow]}`}
                            data-testid={`grooming-weekly-off-${g.id}-${col.dow}`}
                            onCheckedChange={(c) =>
                              handleWeeklyOffToggle(g.id, col.dow, c === true)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-4">
        <div>
          <h4 className="text-sm font-semibold">Leave &amp; time off</h4>
          <p className="text-xs text-muted-foreground">
            Annual leave, holidays, or extra days off — set a start and end date (same day for a
            single day).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Groomer</Label>
            <Select
              value={leaveGroomerId || UNASSIGNED}
              onValueChange={(v) => setLeaveGroomerId(v === UNASSIGNED ? "" : v)}
            >
              <SelectTrigger className="h-9 w-[10rem]">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED} disabled>
                  Select groomer
                </SelectItem>
                {groomers.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-9 w-[10rem]"
              value={leaveStart}
              onChange={(e) => setLeaveStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-9 w-[10rem]"
              value={leaveEnd}
              onChange={(e) => setLeaveEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              className="h-9 w-[12rem]"
              value={leaveNote}
              onChange={(e) => setLeaveNote(e.target.value)}
              placeholder="Annual leave"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAddLeave}
            disabled={addLeave.isPending}
            data-testid="grooming-add-leave-btn"
          >
            Add leave
          </Button>
        </div>

        {leaveLoading ? (
          <p className="text-xs text-muted-foreground">Loading leave…</p>
        ) : leavePeriods.length === 0 ? (
          <p className="text-xs text-muted-foreground">No upcoming leave scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {leavePeriods.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{row.groomer_name}</span>
                  {" · "}
                  {formatLeaveRange(row.start_date, row.end_date)}
                  {row.note ? (
                    <span className="text-muted-foreground"> — {row.note}</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Remove leave period"
                  disabled={removeLeave.isPending}
                  onClick={() =>
                    removeLeave.mutate(row.id, {
                      onSuccess: () => toast.success("Leave removed."),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Could not remove leave."),
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
