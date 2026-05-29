import { normalizeGroomingWorkflowStatus } from "@/lib/groomingWorkflow";

/** Grooming day grid: 07:00–19:00 local time. */
export const GROOMING_GRID_START_MINUTES = 7 * 60;
export const GROOMING_GRID_END_MINUTES = 19 * 60;
export const GROOMING_SLOT_MINUTES = 30;
export const GROOMING_GRID_ROW_COUNT =
  (GROOMING_GRID_END_MINUTES - GROOMING_GRID_START_MINUTES) / GROOMING_SLOT_MINUTES;

export const UNASSIGNED_STATION_ID = "__unassigned__";

export type TimeRangeMinutes = { start: number; end: number };

export type GroomingScheduleConflict = {
  conflictType: "appointment_overlap" | "station_block_overlap";
  conflictedWithId: string;
  label: string;
};

export type GroomingAppointmentForSchedule = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  duration_minutes: number | null;
  station_id?: string | null;
  status: string;
  pets?: { name: string } | null;
  owners?: { first_name: string; last_name: string } | null;
};

export type GroomingStationBlockForSchedule = {
  id: string;
  station_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  is_full_day: boolean;
  reason: string;
};

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

export function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatGridTimeLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function defaultDurationMinutes(): number {
  return 60;
}

export function appointmentDurationMinutes(duration: number | null | undefined): number {
  return duration != null && duration > 0 ? duration : defaultDurationMinutes();
}

export function appointmentTimeRange(
  appointmentTime: string | null,
  durationMinutes: number | null | undefined,
): TimeRangeMinutes | null {
  const start = parseTimeToMinutes(appointmentTime);
  if (start == null) return null;
  const duration = appointmentDurationMinutes(durationMinutes);
  return { start, end: start + duration };
}

export function blockTimeRange(block: GroomingStationBlockForSchedule): TimeRangeMinutes {
  if (block.is_full_day) {
    return { start: GROOMING_GRID_START_MINUTES, end: GROOMING_GRID_END_MINUTES };
  }
  const start = parseTimeToMinutes(block.start_time) ?? GROOMING_GRID_START_MINUTES;
  const end = parseTimeToMinutes(block.end_time) ?? GROOMING_GRID_END_MINUTES;
  return {
    start: Math.max(start, GROOMING_GRID_START_MINUTES),
    end: Math.min(end, GROOMING_GRID_END_MINUTES),
  };
}

export function rangesOverlap(a: TimeRangeMinutes, b: TimeRangeMinutes): boolean {
  return a.start < b.end && b.start < a.end;
}

export function maxDurationMinutesForStart(startMinutes: number): number {
  return Math.max(0, GROOMING_GRID_END_MINUTES - startMinutes);
}

export function maxDurationMinutesForTimeInput(timeHHMM: string): number {
  const start = parseTimeToMinutes(timeHHMM);
  if (start == null) return 0;
  return maxDurationMinutesForStart(start);
}

/** Returns user-visible error or null if valid. */
export function validateGroomingScheduleTime(
  timeHHMM: string,
  durationMinutes: number,
): string | null {
  if (!/^\d{2}:\d{2}$/.test(timeHHMM)) return "Enter a valid appointment time.";
  const start = parseTimeToMinutes(timeHHMM);
  if (start == null) return "Enter a valid appointment time.";
  if (start < GROOMING_GRID_START_MINUTES || start >= GROOMING_GRID_END_MINUTES) {
    return "Appointment time must be between 7:00 AM and 7:00 PM.";
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return "Enter a valid duration.";
  }
  if (start + durationMinutes > GROOMING_GRID_END_MINUTES) {
    return "Appointment must end by 7:00 PM.";
  }
  return null;
}

export function isAppointmentPastGridEnd(
  appointmentTime: string | null,
  durationMinutes: number | null | undefined,
): boolean {
  const range = appointmentTimeRange(appointmentTime, durationMinutes);
  if (!range) return false;
  return range.end > GROOMING_GRID_END_MINUTES;
}

function isActiveAppointment(status: string): boolean {
  return normalizeGroomingWorkflowStatus(status) !== "cancelled";
}

function conflictLabelForAppointment(appt: GroomingAppointmentForSchedule): string {
  const pet = appt.pets?.name ?? "Pet";
  const owner = appt.owners
    ? `${appt.owners.first_name} ${appt.owners.last_name}`.trim()
    : "Owner";
  const time = appt.appointment_time?.slice(0, 5) ?? "??:??";
  return `${pet} (${owner}) at ${time}`;
}

export function findGroomingScheduleConflicts(args: {
  stationId: string | null | undefined;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  excludeAppointmentId?: string;
  appointments: GroomingAppointmentForSchedule[];
  blocks: GroomingStationBlockForSchedule[];
}): GroomingScheduleConflict[] {
  const stationId = args.stationId?.trim();
  if (!stationId || stationId === UNASSIGNED_STATION_ID) return [];

  const candidateRange = appointmentTimeRange(
    `${args.appointmentTime}:00`,
    args.durationMinutes,
  );
  if (!candidateRange) return [];

  const conflicts: GroomingScheduleConflict[] = [];

  for (const block of args.blocks) {
    if (block.station_id !== stationId) continue;
    if (block.block_date !== args.appointmentDate) continue;
    if (rangesOverlap(candidateRange, blockTimeRange(block))) {
      conflicts.push({
        conflictType: "station_block_overlap",
        conflictedWithId: block.id,
        label: block.reason.trim()
          ? `Station block: ${block.reason.trim()}`
          : "Station block",
      });
    }
  }

  for (const appt of args.appointments) {
    if (args.excludeAppointmentId && appt.id === args.excludeAppointmentId) continue;
    if (!isActiveAppointment(appt.status)) continue;
    if (appt.appointment_date !== args.appointmentDate) continue;
    if (appt.station_id !== stationId) continue;
    const range = appointmentTimeRange(appt.appointment_time, appt.duration_minutes);
    if (!range) continue;
    if (rangesOverlap(candidateRange, range)) {
      conflicts.push({
        conflictType: "appointment_overlap",
        conflictedWithId: appt.id,
        label: conflictLabelForAppointment(appt),
      });
    }
  }

  return conflicts;
}

export function isSlotBlocked(args: {
  stationId: string;
  slotStartMinutes: number;
  blocks: GroomingStationBlockForSchedule[];
}): GroomingStationBlockForSchedule | null {
  const slotEnd = args.slotStartMinutes + GROOMING_SLOT_MINUTES;
  const slotRange = { start: args.slotStartMinutes, end: slotEnd };
  for (const block of args.blocks) {
    if (block.station_id !== args.stationId) continue;
    if (rangesOverlap(slotRange, blockTimeRange(block))) return block;
  }
  return null;
}

export function slotOverlapsAppointment(args: {
  slotStartMinutes: number;
  appointmentTime: string | null;
  durationMinutes: number | null | undefined;
}): boolean {
  const apptRange = appointmentTimeRange(args.appointmentTime, args.durationMinutes);
  if (!apptRange) return false;
  const slotRange = {
    start: args.slotStartMinutes,
    end: args.slotStartMinutes + GROOMING_SLOT_MINUTES,
  };
  return rangesOverlap(slotRange, apptRange);
}

export function minutesFromGridClick(offsetY: number, rowHeightPx: number): number | null {
  if (offsetY < 0) return null;
  const rowIndex = Math.floor(offsetY / rowHeightPx);
  if (rowIndex < 0 || rowIndex >= GROOMING_GRID_ROW_COUNT) return null;
  return GROOMING_GRID_START_MINUTES + rowIndex * GROOMING_SLOT_MINUTES;
}

export function blockTopPx(minutesFromStart: number, rowHeightPx: number): number {
  const offsetWithinGrid = minutesFromStart - GROOMING_GRID_START_MINUTES;
  return (offsetWithinGrid / GROOMING_SLOT_MINUTES) * rowHeightPx;
}

export function blockHeightPx(durationMinutes: number, rowHeightPx: number): number {
  return (durationMinutes / GROOMING_SLOT_MINUTES) * rowHeightPx;
}
