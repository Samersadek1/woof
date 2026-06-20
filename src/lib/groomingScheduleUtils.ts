/** Grooming capacity board operating window: 08:00–18:00 local. */
export const GROOMING_BOARD_START_MINUTES = 8 * 60;
export const GROOMING_BOARD_END_MINUTES = 18 * 60;

export type GroomingScheduleConflict = {
  conflictType: "appointment_overlap" | "station_block_overlap";
  conflictedWithId: string;
  label: string;
};

export function warningsToScheduleConflicts(
  warnings: { code: string; msg: string }[],
): GroomingScheduleConflict[] {
  return warnings.map((w, i) => ({
    conflictType: "appointment_overlap" as const,
    conflictedWithId: `warn-${i}-${w.code}`,
    label: w.msg,
  }));
}

/** Parse HH:MM or HH:MM:SS to minutes from midnight. */
export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function maxDurationMinutesForStart(startMinutes: number): number {
  return Math.max(0, GROOMING_BOARD_END_MINUTES - startMinutes);
}

export function maxDurationMinutesForTimeInput(timeHHMM: string): number {
  const start = parseTimeToMinutes(timeHHMM);
  if (start == null) return 0;
  return maxDurationMinutesForStart(start);
}

/** Returns user-visible error or null if valid (board hours). */
export function validateGroomingScheduleTime(
  timeHHMM: string,
  durationMinutes: number,
): string | null {
  if (!/^\d{2}:\d{2}$/.test(timeHHMM)) return "Enter a valid appointment time.";
  const start = parseTimeToMinutes(timeHHMM);
  if (start == null) return "Enter a valid appointment time.";
  if (start < GROOMING_BOARD_START_MINUTES || start >= GROOMING_BOARD_END_MINUTES) {
    return "Appointment time must be between 8:00 AM and 6:00 PM.";
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return "Enter a valid duration.";
  }
  if (start + durationMinutes > GROOMING_BOARD_END_MINUTES) {
    return "Appointment must end by 6:00 PM.";
  }
  return null;
}
