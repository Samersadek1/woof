import { describe, expect, it } from "vitest";

import { lastNight, planBoardingRoomAssignmentSync } from "./boardingRoomAssignmentSync";

describe("lastNight", () => {
  it("returns day before exclusive checkout", () => {
    expect(lastNight("2026-06-05")).toBe("2026-06-04");
  });
});

describe("planBoardingRoomAssignmentSync", () => {
  it("deletes segments entirely after last occupied night (early checkout)", () => {
    const { actions } = planBoardingRoomAssignmentSync(
      [{ id: "a", start_date: "2026-06-01", end_date: "2026-06-02" }],
      "2026-05-22",
      "2026-05-28",
    );
    expect(actions).toEqual([{ type: "delete", id: "a" }]);
  });

  it("deletes segments entirely before new check-in (moved later)", () => {
    const { actions } = planBoardingRoomAssignmentSync(
      [{ id: "r", start_date: "2026-06-01", end_date: "2026-06-07" }],
      "2026-06-29",
      "2026-09-01",
    );
    expect(actions).toEqual([{ type: "delete", id: "r" }]);
  });

  it("trims segment end when checkout shortened", () => {
    const { actions } = planBoardingRoomAssignmentSync(
      [{ id: "b", start_date: "2026-05-25", end_date: "2026-06-10" }],
      "2026-05-25",
      "2026-06-03",
    );
    expect(actions).toEqual([{ type: "update", id: "b", end_date: "2026-06-02" }]);
  });

  it("clips segment start when check-in moved later within stay", () => {
    const { actions } = planBoardingRoomAssignmentSync(
      [{ id: "c", start_date: "2026-06-01", end_date: "2026-07-10" }],
      "2026-06-05",
      "2026-07-15",
    );
    expect(actions).toEqual([{ type: "update", id: "c", start_date: "2026-06-05" }]);
  });

  it("extends last segment when checkout extended", () => {
    const { actions, extendLastSegmentTo } = planBoardingRoomAssignmentSync(
      [{ id: "d", start_date: "2026-06-01", end_date: "2026-06-04" }],
      "2026-06-01",
      "2026-06-10",
    );
    expect(actions).toEqual([]);
    expect(extendLastSegmentTo).toBe("2026-06-09");
  });
});
