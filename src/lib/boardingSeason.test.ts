import { describe, expect, it } from "vitest";
import {
  boardingStaySeasonSummary,
  eachBoardingNight,
} from "./boardingSeason";

describe("boardingSeason", () => {
  it("lists each billed night between check-in and check-out", () => {
    expect(eachBoardingNight("2026-07-01", "2026-07-04")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("summarizes mixed peak stays", () => {
    expect(boardingStaySeasonSummary(2, 1)).toBe("Mixed (2 peak, 1 off-peak)");
    expect(boardingStaySeasonSummary(3, 0)).toBe("Peak");
    expect(boardingStaySeasonSummary(0, 2)).toBe("Off-peak");
  });
});
