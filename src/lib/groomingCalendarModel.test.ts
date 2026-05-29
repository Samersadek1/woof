import { describe, expect, it } from "vitest";
import {
  findGroomingScheduleConflicts,
  maxDurationMinutesForTimeInput,
  rangesOverlap,
  validateGroomingScheduleTime,
} from "./groomingCalendarModel";

describe("groomingCalendarModel", () => {
  it("validates 7 PM boundary", () => {
    expect(validateGroomingScheduleTime("18:00", 60)).toBeNull();
    expect(validateGroomingScheduleTime("18:30", 60)).toBe(
      "Appointment must end by 7:00 PM.",
    );
    expect(validateGroomingScheduleTime("06:30", 60)).toMatch(/7:00 AM/);
  });

  it("computes max duration for late starts", () => {
    expect(maxDurationMinutesForTimeInput("18:00")).toBe(60);
    expect(maxDurationMinutesForTimeInput("18:30")).toBe(30);
  });

  it("detects overlapping appointments on same station", () => {
    const conflicts = findGroomingScheduleConflicts({
      stationId: "st-1",
      appointmentDate: "2026-05-29",
      appointmentTime: "10:00",
      durationMinutes: 60,
      appointments: [
        {
          id: "a1",
          appointment_date: "2026-05-29",
          appointment_time: "10:30:00",
          duration_minutes: 60,
          station_id: "st-1",
          status: "new",
          pets: { name: "Buddy" },
          owners: { first_name: "Jane", last_name: "Doe" },
        },
      ],
      blocks: [],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflictType).toBe("appointment_overlap");
  });

  it("detects station block overlap", () => {
    const conflicts = findGroomingScheduleConflicts({
      stationId: "st-1",
      appointmentDate: "2026-05-29",
      appointmentTime: "10:00",
      durationMinutes: 60,
      appointments: [],
      blocks: [
        {
          id: "b1",
          station_id: "st-1",
          block_date: "2026-05-29",
          start_time: "09:00:00",
          end_time: "11:00:00",
          is_full_day: false,
          reason: "Maintenance",
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflictType).toBe("station_block_overlap");
  });

  it("rangesOverlap is half-open friendly", () => {
    expect(rangesOverlap({ start: 600, end: 660 }, { start: 660, end: 720 })).toBe(false);
    expect(rangesOverlap({ start: 600, end: 661 }, { start: 660, end: 720 })).toBe(true);
  });
});
