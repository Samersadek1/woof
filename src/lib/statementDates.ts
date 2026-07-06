const DUBAI_TZ = "Asia/Dubai";

/** YYYY-MM-DD in Dubai calendar. */
export function getDubaiTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DUBAI_TZ }).format(new Date());
}

function dubaiDateParts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

/** UTC instant for start of a Dubai calendar day (00:00:00.000+04:00). */
export function getDubaiDayUtcStart(dateStr: string): string {
  const { y, m, d } = dubaiDateParts(dateStr);
  return new Date(Date.UTC(y, m - 1, d, -4, 0, 0, 0)).toISOString();
}

/** UTC instant for end of a Dubai calendar day (23:59:59.999+04:00). */
export function getDubaiDayUtcEndInclusive(dateStr: string): string {
  const { y, m, d } = dubaiDateParts(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 19, 59, 59, 999)).toISOString();
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const { y, m, d } = dubaiDateParts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type StatementDatePreset = "30d" | "90d" | "180d" | "1y";

const PRESET_DAYS: Record<StatementDatePreset, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "1y": 365,
};

export function presetToFromDate(preset: StatementDatePreset, today = getDubaiTodayDate()): string {
  return addDaysToDateString(today, -PRESET_DAYS[preset]);
}

/** Default statement window: last 90 Dubai days through today. */
export function defaultStatementRange(today = getDubaiTodayDate()): {
  fromDate: string;
  toDate: string;
  fromIso: string;
  toIso: string;
} {
  const toDate = today;
  const fromDate = presetToFromDate("90d", today);
  return {
    fromDate,
    toDate,
    fromIso: getDubaiDayUtcStart(fromDate),
    toIso: getDubaiDayUtcEndInclusive(toDate),
  };
}

export function statementRangeFromDates(fromDate: string, toDate: string): {
  fromIso: string;
  toIso: string;
} {
  return {
    fromIso: getDubaiDayUtcStart(fromDate),
    toIso: getDubaiDayUtcEndInclusive(toDate),
  };
}
