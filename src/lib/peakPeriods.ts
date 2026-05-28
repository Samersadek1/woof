import { format, parseISO } from "date-fns";

export type PeakPeriodInput = {
  label?: string | null;
  startDate: string;
  endDate: string;
  notes?: string | null;
};

export type PeakPeriodValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validatePeakPeriodInput(input: PeakPeriodInput): PeakPeriodValidationResult {
  const start = input.startDate?.trim();
  const end = input.endDate?.trim();
  if (!start || !end) {
    return { ok: false, message: "Start and end dates are required." };
  }
  if (end < start) {
    return { ok: false, message: "End date must be on or after the start date." };
  }
  return { ok: true };
}

/** Display label for a peak date range (inclusive). */
export function formatPeakPeriodRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (startDate === endDate) {
    return format(start, "d MMM yyyy");
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  }
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

export function defaultPeakPeriodLabel(startDate: string, endDate: string): string {
  return formatPeakPeriodRange(startDate, endDate);
}
