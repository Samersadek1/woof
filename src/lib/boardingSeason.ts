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

export type BoardingNightSeasonInput = {
  date: string;
  season: BoardingRateSeason;
};

export type BoardingContiguousSeasonRun = {
  season: BoardingRateSeason;
  startDate: string;
  endDate: string;
  nights: BoardingNightSeasonInput[];
};

/** Split ordered nights into contiguous calendar runs of the same season. */
export function groupBoardingNightsByContiguousSeason(
  nights: BoardingNightSeasonInput[],
): BoardingContiguousSeasonRun[] {
  if (nights.length === 0) return [];

  const runs: BoardingContiguousSeasonRun[] = [];
  for (const night of nights) {
    const last = runs[runs.length - 1];
    const isContiguous =
      last &&
      last.season === night.season &&
      differenceInCalendarDays(parseISO(night.date), parseISO(last.endDate)) === 1;

    if (isContiguous) {
      last.endDate = night.date;
      last.nights.push(night);
    } else {
      runs.push({
        season: night.season,
        startDate: night.date,
        endDate: night.date,
        nights: [night],
      });
    }
  }
  return runs;
}

/** Human-readable billed date or range, e.g. "4 Dec 2025" or "1 Dec – 3 Dec 2025". */
export function formatBoardingDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (startDate === endDate) {
    return format(start, "d MMM yyyy");
  }
  const sameYear = format(start, "yyyy") === format(end, "yyyy");
  if (sameYear) {
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  }
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}
