import { describe, expect, it } from "vitest";
import {
  boardingStaySeasonSummary,
  eachBoardingNight,
  formatBoardingDateRange,
  groupBoardingNightsByContiguousSeason,
} from "./boardingSeason";

describe("boardingSeason", () => {
  it("lists each billed night between check-in and check-out", () => {
    expect(eachBoardingNight("2026-07-01", "2026-07-04")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("returns no nights when the stay exceeds the safety cap", () => {
    expect(eachBoardingNight("2026-01-01", "2028-01-01")).toEqual([]);
  });

  it("summarizes mixed peak stays", () => {
    expect(boardingStaySeasonSummary(2, 1)).toBe("Mixed (2 peak, 1 off-peak)");
    expect(boardingStaySeasonSummary(3, 0)).toBe("Peak");
    expect(boardingStaySeasonSummary(0, 2)).toBe("Off-peak");
  });

  it("groups nights into contiguous season runs", () => {
    const nights = [
      { date: "2025-12-01", season: "off_peak" as const },
      { date: "2025-12-02", season: "off_peak" as const },
      { date: "2025-12-03", season: "off_peak" as const },
      { date: "2025-12-04", season: "peak" as const },
      { date: "2025-12-05", season: "peak" as const },
      { date: "2025-12-06", season: "off_peak" as const },
    ];

    expect(groupBoardingNightsByContiguousSeason(nights)).toEqual([
      {
        season: "off_peak",
        startDate: "2025-12-01",
        endDate: "2025-12-03",
        nights: nights.slice(0, 3),
      },
      {
        season: "peak",
        startDate: "2025-12-04",
        endDate: "2025-12-05",
        nights: nights.slice(3, 5),
      },
      {
        season: "off_peak",
        startDate: "2025-12-06",
        endDate: "2025-12-06",
        nights: [nights[5]],
      },
    ]);
  });

  it("formats single-night and multi-night date ranges", () => {
    expect(formatBoardingDateRange("2025-12-04", "2025-12-04")).toBe("4 Dec 2025");
    expect(formatBoardingDateRange("2025-12-01", "2025-12-03")).toBe("1 Dec – 3 Dec 2025");
    expect(formatBoardingDateRange("2025-12-20", "2026-01-02")).toBe("20 Dec 2025 – 2 Jan 2026");
  });
});
