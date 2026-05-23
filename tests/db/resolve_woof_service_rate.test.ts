import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";

type ServiceCode = Database["public"]["Enums"]["service_code"];

async function resolveRate(args: {
  serviceCode: ServiceCode;
  bookingDate?: string;
  petSize?: Database["public"]["Enums"]["pet_size"] | null;
  coatType?: Database["public"]["Enums"]["coat_type"] | null;
}) {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
    p_service_code: args.serviceCode,
    p_booking_date: args.bookingDate,
    p_pet_size: args.petSize ?? undefined,
    p_coat_type: args.coatType ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

describe("resolve_woof_service_rate", () => {
  it("returns boarding peak rate on July 15", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2026-07-15" });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_aed).toBe(127.5);
    expect(rows[0].matched_season).toBe("peak");
  });

  it("returns boarding peak rate on August 31 (inclusive)", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2026-08-31" });
    expect(rows[0].amount_aed).toBe(127.5);
  });

  it("returns boarding off-peak rate on March 15", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2026-03-15" });
    expect(rows[0].amount_aed).toBe(115.5);
    expect(rows[0].is_peak).toBe(false);
  });

  it("returns year-spanning peak rate for Dec 28", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2026-12-28" });
    expect(rows[0].amount_aed).toBe(127.5);
    expect(rows[0].is_peak).toBe(true);
  });

  it("returns year-spanning peak rate for Jan 5", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2027-01-05" });
    expect(rows[0].amount_aed).toBe(127.5);
    expect(rows[0].is_peak).toBe(true);
  });

  it("returns off-peak rate after year-spanning peak ends", async () => {
    const rows = await resolveRate({ serviceCode: "boarding_night", bookingDate: "2027-01-09" });
    expect(rows[0].amount_aed).toBe(115.5);
    expect(rows[0].is_peak).toBe(false);
  });

  it("resolves medium full service grooming", async () => {
    const rows = await resolveRate({ serviceCode: "grooming_full_service", petSize: "medium" });
    expect(rows[0].amount_aed).toBe(236.25);
  });

  it("resolves large full service grooming", async () => {
    const rows = await resolveRate({ serviceCode: "grooming_full_service", petSize: "large" });
    expect(rows[0].amount_aed).toBe(262.5);
  });

  it("resolves splash long-coat large dog", async () => {
    const rows = await resolveRate({
      serviceCode: "grooming_splash",
      petSize: "large",
      coatType: "long",
    });
    expect(rows[0].amount_aed).toBe(157.5);
  });

  it("resolves splash short-coat small dog", async () => {
    const rows = await resolveRate({
      serviceCode: "grooming_splash",
      petSize: "small",
      coatType: "short",
    });
    expect(rows[0].amount_aed).toBe(105);
  });

  it("resolves cat grooming splash short coat", async () => {
    const rows = await resolveRate({
      serviceCode: "cat_grooming_splash",
      coatType: "short",
    });
    expect(rows[0].amount_aed).toBe(131.25);
  });

  it("resolves hair-no-more mid length", async () => {
    const rows = await resolveRate({
      serviceCode: "grooming_hair_no_more",
      coatType: "mid_length",
    });
    expect(rows[0].amount_aed).toBe(262.5);
  });

  it("resolves cat hair-no-more without dimensions", async () => {
    const rows = await resolveRate({ serviceCode: "cat_grooming_hair_no_more" });
    expect(rows[0].amount_aed).toBe(262.5);
  });

  it("resolves addon_nails as flat add-on", async () => {
    const rows = await resolveRate({ serviceCode: "addon_nails" });
    expect(rows[0].amount_aed).toBe(36.75);
  });

  it("resolves assessment_with_first_hour", async () => {
    const rows = await resolveRate({ serviceCode: "assessment_with_first_hour" });
    expect(rows[0].amount_aed).toBe(52.5);
  });

  it("returns empty result when no matching dimension rate exists", async () => {
    const rows = await resolveRate({
      serviceCode: "grooming_splash",
      petSize: "medium",
      coatType: "mid_length",
    });
    expect(rows).toHaveLength(0);
  });
});
