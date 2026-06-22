import { parseISO } from "date-fns";

/** Postgres `extract(dow)` convention: 0 = Sunday … 6 = Saturday. */
export const GROOMING_WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Max recurring weekly rest days per groomer. */
export const MAX_GROOMER_WEEKLY_DAYS_OFF = 2;

export type GroomingStationWeeklyAssignmentRow = {
  station_id: string;
  day_of_week: number;
  groomer_id: string;
};

export type GroomingGroomerWeeklyOffRow = {
  groomer_id: string;
  day_of_week: number;
};

export type GroomingGroomerLeavePeriodRow = {
  groomer_id: string;
  start_date: string;
  end_date: string;
};

export type GroomerOffSchedule = {
  weeklyOffDays: readonly GroomingGroomerWeeklyOffRow[];
  leavePeriods: readonly GroomingGroomerLeavePeriodRow[];
};

export function dayOfWeekFromIsoDate(dateIso: string): number {
  const d = parseISO(dateIso.slice(0, 10));
  return d.getDay();
}

export function isDateInLeavePeriod(
  dateIso: string,
  period: GroomingGroomerLeavePeriodRow,
): boolean {
  const date = dateIso.slice(0, 10);
  const start = period.start_date.slice(0, 10);
  const end = period.end_date.slice(0, 10);
  return date >= start && date <= end;
}

export function isGroomerOffOnDate(
  groomerId: string,
  dateIso: string,
  schedule: GroomerOffSchedule,
): boolean {
  const dow = dayOfWeekFromIsoDate(dateIso);
  if (
    schedule.weeklyOffDays.some(
      (w) => w.groomer_id === groomerId && w.day_of_week === dow,
    )
  ) {
    return true;
  }
  if (
    schedule.leavePeriods.some(
      (p) => p.groomer_id === groomerId && isDateInLeavePeriod(dateIso, p),
    )
  ) {
    return true;
  }
  return false;
}

export function countGroomerWeeklyOffDays(
  groomerId: string,
  weeklyOffDays: readonly GroomingGroomerWeeklyOffRow[],
): number {
  return weeklyOffDays.filter((w) => w.groomer_id === groomerId).length;
}

export function resolveStationGroomerForDate(
  stationId: string,
  dateIso: string,
  weekly: readonly GroomingStationWeeklyAssignmentRow[],
  schedule: GroomerOffSchedule,
  groomersById: ReadonlyMap<string, string>,
): string | null {
  const dow = dayOfWeekFromIsoDate(dateIso);
  const assignment = weekly.find((w) => w.station_id === stationId && w.day_of_week === dow);
  if (!assignment) return null;
  if (isGroomerOffOnDate(assignment.groomer_id, dateIso, schedule)) return null;
  return groomersById.get(assignment.groomer_id) ?? null;
}

export function buildStationGroomerMapForDate(
  stationIds: readonly string[],
  dateIso: string,
  weekly: readonly GroomingStationWeeklyAssignmentRow[],
  schedule: GroomerOffSchedule,
  groomersById: ReadonlyMap<string, string>,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const stationId of stationIds) {
    map.set(
      stationId,
      resolveStationGroomerForDate(stationId, dateIso, weekly, schedule, groomersById),
    );
  }
  return map;
}

/** Date range for loading leave periods around a viewed board date (±14 days). */
export function daysOffQueryRange(dateIso: string): { fromDate: string; toDate: string } {
  const base = parseISO(dateIso.slice(0, 10));
  const from = new Date(base);
  from.setDate(from.getDate() - 14);
  const to = new Date(base);
  to.setDate(to.getDate() + 14);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { fromDate: fmt(from), toDate: fmt(to) };
}

export function leavePeriodsOverlapRange(
  periods: readonly GroomingGroomerLeavePeriodRow[],
  fromDate: string,
  toDate: string,
): GroomingGroomerLeavePeriodRow[] {
  return periods.filter((p) => p.start_date.slice(0, 10) <= toDate && p.end_date.slice(0, 10) >= fromDate);
}
