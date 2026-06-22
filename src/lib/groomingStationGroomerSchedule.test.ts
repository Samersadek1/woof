import { describe, expect, it } from "vitest";
import {
  buildStationGroomerMapForDate,
  countGroomerWeeklyOffDays,
  dayOfWeekFromIsoDate,
  isDateInLeavePeriod,
  isGroomerOffOnDate,
  MAX_GROOMER_WEEKLY_DAYS_OFF,
  resolveStationGroomerForDate,
} from "./groomingStationGroomerSchedule";

const groomersById = new Map([
  ["g-ruben", "Ruben"],
  ["g-eliane", "Eliane"],
]);

const weekly = [
  { station_id: "st-1", day_of_week: 1, groomer_id: "g-ruben" },
  { station_id: "st-2", day_of_week: 1, groomer_id: "g-eliane" },
];

const emptySchedule = { weeklyOffDays: [], leavePeriods: [] };

describe("groomingStationGroomerSchedule", () => {
  it("dayOfWeekFromIsoDate uses Sunday=0", () => {
    expect(dayOfWeekFromIsoDate("2026-06-21")).toBe(0);
    expect(dayOfWeekFromIsoDate("2026-06-22")).toBe(1);
  });

  it("resolveStationGroomerForDate returns groomer name for weekly match", () => {
    expect(
      resolveStationGroomerForDate("st-1", "2026-06-22", weekly, emptySchedule, groomersById),
    ).toBe("Ruben");
  });

  it("resolveStationGroomerForDate returns null when unassigned", () => {
    expect(
      resolveStationGroomerForDate("st-1", "2026-06-23", weekly, emptySchedule, groomersById),
    ).toBeNull();
  });

  it("recurring weekly day off suppresses assignment", () => {
    const schedule = {
      weeklyOffDays: [{ groomer_id: "g-ruben", day_of_week: 1 }],
      leavePeriods: [],
    };
    expect(
      resolveStationGroomerForDate("st-1", "2026-06-22", weekly, schedule, groomersById),
    ).toBeNull();
    expect(isGroomerOffOnDate("g-ruben", "2026-06-22", schedule)).toBe(true);
    expect(isGroomerOffOnDate("g-ruben", "2026-06-23", schedule)).toBe(false);
  });

  it("leave period suppresses assignment for date range", () => {
    const schedule = {
      weeklyOffDays: [],
      leavePeriods: [
        { groomer_id: "g-ruben", start_date: "2026-06-20", end_date: "2026-06-25" },
      ],
    };
    expect(isDateInLeavePeriod("2026-06-22", schedule.leavePeriods[0])).toBe(true);
    expect(isDateInLeavePeriod("2026-06-26", schedule.leavePeriods[0])).toBe(false);
    expect(
      resolveStationGroomerForDate("st-1", "2026-06-22", weekly, schedule, groomersById),
    ).toBeNull();
    expect(
      resolveStationGroomerForDate("st-1", "2026-06-29", weekly, schedule, groomersById),
    ).toBe("Ruben");
  });

  it("buildStationGroomerMapForDate maps all stations", () => {
    const map = buildStationGroomerMapForDate(
      ["st-1", "st-2", "st-3"],
      "2026-06-22",
      weekly,
      emptySchedule,
      groomersById,
    );
    expect(map.get("st-1")).toBe("Ruben");
    expect(map.get("st-2")).toBe("Eliane");
    expect(map.get("st-3")).toBeNull();
  });

  it("MAX_GROOMER_WEEKLY_DAYS_OFF is 2", () => {
    expect(MAX_GROOMER_WEEKLY_DAYS_OFF).toBe(2);
    const weeklyOff = [
      { groomer_id: "g-ruben", day_of_week: 0 },
      { groomer_id: "g-ruben", day_of_week: 6 },
    ];
    expect(countGroomerWeeklyOffDays("g-ruben", weeklyOff)).toBe(2);
  });
});
