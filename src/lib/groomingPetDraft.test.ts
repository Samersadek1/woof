import { describe, expect, it } from "vitest";
import { parseISO } from "date-fns";
import {
  buildInsertFromDraft,
  createDefaultPetDraft,
  draftServiceLabels,
  normalizedDiscountPct,
  resolveGroomingAppointmentFinalCharge,
} from "./groomingPetDraft";

describe("groomingPetDraft", () => {
  const baseDraft = () =>
    createDefaultPetDraft({
      petId: "pet-1",
      defaultDay: parseISO("2026-05-29"),
      dogSizeFromPet: "Medium",
      apptTime: "10:00",
      stationId: "station-1",
    });

  it("createDefaultPetDraft sets independent defaults", () => {
    const d = baseDraft();
    expect(d.petId).toBe("pet-1");
    expect(d.selectedServices).toEqual(["full_groom"]);
    expect(d.stationId).toBe("station-1");
    expect(d.apptTime).toBe("10:00");
  });

  it("normalizedDiscountPct clamps 0-100", () => {
    expect(normalizedDiscountPct("15")).toBe(15);
    expect(normalizedDiscountPct("150")).toBe(100);
    expect(normalizedDiscountPct("")).toBe(0);
  });

  it("buildInsertFromDraft returns per-pet insert payload", () => {
    const draft = { ...baseDraft(), price: "120", dogSize: "Medium" as const };
    const result = buildInsertFromDraft({
      draft,
      ownerId: "owner-1",
      bookingId: "booking-1",
      paymentMethod: null,
      manualFeeBounds: null,
      isComplimentary: false,
      computedOriginalAed: 120,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.pet_id).toBe("pet-1");
    expect(result.booking_id).toBe("booking-1");
    expect(result.station_id).toBe("station-1");
    expect(result.price).toBe(120);
    expect(result.notes).toContain("Services:");
  });

  it("buildInsertFromDraft accepts addon-only service selection", () => {
    const draft = {
      ...baseDraft(),
      selectedServices: ["nail_clip"],
      price: "45",
      dogSize: "Medium" as const,
    };
    const result = buildInsertFromDraft({
      draft,
      ownerId: "owner-1",
      bookingId: null,
      paymentMethod: null,
      manualFeeBounds: null,
      isComplimentary: false,
      computedOriginalAed: 45,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.service).toBe("nail_clip");
  });

  it("draftServiceLabels includes matting fee amount", () => {
    const draft = {
      ...baseDraft(),
      selectedServices: ["full_groom", "matting_fee"] as const,
      mattingFeeAed: "80",
    };
    const labels = draftServiceLabels(
      { ...draft, selectedServices: [...draft.selectedServices] },
      { mattingMin: 50, mattingMax: 100, heavyMin: 0, heavyMax: 0 },
    );
    expect(labels).toContain("Matting fee (AED 80)");
  });

  it("resolveGroomingAppointmentFinalCharge keeps manual price override", () => {
    const draft = { ...baseDraft(), price: "150", dogSize: "Medium" as const, useCredit: false };
    expect(
      resolveGroomingAppointmentFinalCharge({
        insertPrice: 150,
        draft,
        creditConsumed: false,
        breakdown: { total: 120, addons: 0 },
        isComplimentary: false,
      }),
    ).toBe(150);
  });

  it("resolveGroomingAppointmentFinalCharge charges full catalog price when credit vanished", () => {
    const draft = { ...baseDraft(), price: "30", dogSize: "Medium" as const, useCredit: true };
    expect(
      resolveGroomingAppointmentFinalCharge({
        insertPrice: 30,
        draft,
        creditConsumed: false,
        breakdown: { total: 120, addons: 30 },
        isComplimentary: false,
      }),
    ).toBe(120);
  });

  it("resolveGroomingAppointmentFinalCharge uses addons when credit consumed", () => {
    const draft = { ...baseDraft(), price: "35", dogSize: "Medium" as const, useCredit: true };
    expect(
      resolveGroomingAppointmentFinalCharge({
        insertPrice: 35,
        draft,
        creditConsumed: true,
        breakdown: { total: 120, addons: 35 },
        isComplimentary: false,
      }),
    ).toBe(35);
  });
});
