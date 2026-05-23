import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";

describe("is_peak_date", () => {
  async function isPeak(date: string) {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc("is_peak_date", { p_date: date });
    if (error) throw error;
    return data;
  }

  it("returns true on summer peak start", async () => {
    expect(await isPeak("2026-07-01")).toBe(true);
  });

  it("returns true on summer peak inclusive end", async () => {
    expect(await isPeak("2026-09-01")).toBe(true);
  });

  it("returns false after summer peak", async () => {
    expect(await isPeak("2026-09-02")).toBe(false);
  });

  it("returns false before summer peak", async () => {
    expect(await isPeak("2026-06-30")).toBe(false);
  });

  it("returns true on christmas peak range", async () => {
    expect(await isPeak("2026-12-20")).toBe(true);
    expect(await isPeak("2027-01-08")).toBe(true);
  });

  it("returns false after christmas peak ends", async () => {
    expect(await isPeak("2027-01-09")).toBe(false);
  });

  it("returns false in between peak windows", async () => {
    expect(await isPeak("2026-10-15")).toBe(false);
  });
});
