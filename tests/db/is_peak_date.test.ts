import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";

/** Requires `20260528120000_peak_periods_calendar_dates` applied (calendar start_date/end_date rows). */
describe("is_peak_date", () => {
  async function isPeak(date: string) {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc("is_peak_date", { p_date: date });
    if (error) throw error;
    return data;
  }

  it("returns true on May peak window", async () => {
    expect(await isPeak("2026-05-19")).toBe(true);
    expect(await isPeak("2026-05-29")).toBe(true);
    expect(await isPeak("2026-05-18")).toBe(false);
    expect(await isPeak("2026-05-30")).toBe(false);
  });

  it("returns true on June peak nights only", async () => {
    expect(await isPeak("2026-06-15")).toBe(true);
    expect(await isPeak("2026-06-16")).toBe(true);
    expect(await isPeak("2026-06-17")).toBe(false);
  });

  it("returns true on summer peak through August 31", async () => {
    expect(await isPeak("2026-07-01")).toBe(true);
    expect(await isPeak("2026-08-25")).toBe(true);
    expect(await isPeak("2026-08-31")).toBe(true);
    expect(await isPeak("2026-09-01")).toBe(false);
    expect(await isPeak("2026-06-30")).toBe(false);
  });

  it("returns true on late November mini peak", async () => {
    expect(await isPeak("2026-11-30")).toBe(true);
    expect(await isPeak("2026-12-02")).toBe(true);
    expect(await isPeak("2026-12-03")).toBe(false);
  });

  it("returns true on christmas peak range", async () => {
    expect(await isPeak("2026-12-20")).toBe(true);
    expect(await isPeak("2027-01-08")).toBe(true);
    expect(await isPeak("2027-01-09")).toBe(false);
  });

  it("returns false between peak windows", async () => {
    expect(await isPeak("2026-10-15")).toBe(false);
  });
});
