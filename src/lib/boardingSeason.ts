import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type BoardingRateSeason = "peak" | "off_peak";

/** Each calendar night billed between check-in (inclusive) and check-out (exclusive). */
export function eachBoardingNight(checkIn: string, checkOut: string): string[] {
  const count = differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
  if (count <= 0) return [];
  const start = parseISO(checkIn);
  return Array.from({ length: count }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
}

export function boardingRateSeasonLabel(season: BoardingRateSeason): string {
  return season === "peak" ? "Peak" : "Off-peak";
}

/** Human-readable season summary for a stay (single season or mixed). */
export function boardingStaySeasonSummary(
  peakNights: number,
  offPeakNights: number,
): string {
  if (peakNights > 0 && offPeakNights > 0) {
    return `Mixed (${peakNights} peak, ${offPeakNights} off-peak)`;
  }
  if (peakNights > 0) return "Peak";
  if (offPeakNights > 0) return "Off-peak";
  return "—";
}
