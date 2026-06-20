import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import { petSizeToDogSizeFormValue } from "@/lib/dogSizeForm";
import {
  clampHeavyDogFeeAed,
  clampMattingFeeAed,
  groomingPricingCheckboxToDbService,
  isGroomingPricingCheckbox,
  resolvePrimaryGroomingCheckbox,
} from "@/lib/groomingNewAppointmentPricing";
import { maxDurationMinutesForTimeInput } from "@/lib/groomingScheduleUtils";
import type { GroomingPaymentMethod } from "@/lib/groomingPaymentMethod";
import {
  estimatedPickupFromStartAndDuration,
  groomingTimeToDb,
  GROOMING_SERVICE_CHECKBOX_OPTIONS,
  type GroomingServiceCheckbox,
} from "@/lib/groomingServiceForm";

export type PetGroomingDraft = {
  petId: string;
  appointmentDate: Date;
  groomingDate: Date;
  apptTime: string;
  durationMin: number;
  stationId: string | null;
  selectedServices: GroomingServiceCheckbox[];
  groomerName: string;
  dogSize: DogSizeFormValue | null;
  price: string;
  discountPct: string;
  visitNotes: string;
  mattingFeeAed: string;
  heavyDogFeeAed: string;
  useCredit: boolean;
};

export type GroomingManualFeeBounds = {
  mattingMin: number;
  mattingMax: number;
  heavyMin: number;
  heavyMax: number;
};

export function createDefaultPetDraft(args: {
  petId: string;
  defaultDay: Date;
  mattingDefault?: string;
  heavyDefault?: string;
  dogSizeFromPet?: DogSizeFormValue | null;
  groomerName?: string;
  stationId?: string | null;
  apptTime?: string;
}): PetGroomingDraft {
  const apptTime = args.apptTime ?? "10:00";
  const maxDur = maxDurationMinutesForTimeInput(apptTime);
  return {
    petId: args.petId,
    appointmentDate: args.defaultDay,
    groomingDate: args.defaultDay,
    apptTime,
    durationMin: Math.min(60, Math.max(15, maxDur)),
    stationId: args.stationId ?? null,
    selectedServices: ["full_groom"],
    groomerName: args.groomerName ?? "",
    dogSize: args.dogSizeFromPet ?? null,
    price: "",
    discountPct: "",
    visitNotes: "",
    mattingFeeAed: args.mattingDefault ?? "",
    heavyDogFeeAed: args.heavyDefault ?? "",
    useCredit: true,
  };
}

export function dogSizeFromPetRecord(pet: { size?: string | null }): DogSizeFormValue | null {
  return petSizeToDogSizeFormValue(pet.size);
}

export function normalizedDiscountPct(discountPct: string): number {
  const trimmed = discountPct.trim();
  if (trimmed === "") return 0;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export function draftOriginalAed(price: string): number | null {
  const n = Number.parseFloat(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function draftFinalAed(
  price: string,
  discountPct: string,
  isComplimentary: boolean,
): number | null {
  if (isComplimentary) return 0;
  const original = draftOriginalAed(price);
  if (original == null) return null;
  const pct = normalizedDiscountPct(discountPct);
  return Number((original * (1 - pct / 100)).toFixed(2));
}

export function draftManualAddonAed(
  draft: PetGroomingDraft,
  manualFeeBounds: GroomingManualFeeBounds | null | undefined,
): { matting_fee?: number; heavy_dog_fee?: number } | null {
  const out: { matting_fee?: number; heavy_dog_fee?: number } = {};
  if (draft.selectedServices.includes("matting_fee")) {
    const raw = parseFloat(draft.mattingFeeAed);
    const fallback = manualFeeBounds?.mattingMin ?? 0;
    out.matting_fee = clampMattingFeeAed(
      Number.isFinite(raw) ? raw : fallback,
      manualFeeBounds,
    );
  }
  if (draft.selectedServices.includes("heavy_dog_fee")) {
    const raw = parseFloat(draft.heavyDogFeeAed);
    const fallback = manualFeeBounds?.heavyMin ?? 0;
    out.heavy_dog_fee = clampHeavyDogFeeAed(
      Number.isFinite(raw) ? raw : fallback,
      manualFeeBounds,
    );
  }
  return Object.keys(out).length ? out : null;
}

export function draftServiceLabels(
  draft: PetGroomingDraft,
  manualFeeBounds: GroomingManualFeeBounds | null | undefined,
): string {
  return draft.selectedServices
    .map((svc) => {
      const opt = GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.value === svc);
      if (!opt) return svc;
      if (svc === "matting_fee") {
        const raw = parseFloat(draft.mattingFeeAed);
        const v = clampMattingFeeAed(
          Number.isFinite(raw) ? raw : (manualFeeBounds?.mattingMin ?? 0),
          manualFeeBounds,
        );
        return `${opt.label} (AED ${v})`;
      }
      if (svc === "heavy_dog_fee") {
        const raw = parseFloat(draft.heavyDogFeeAed);
        const v = clampHeavyDogFeeAed(
          Number.isFinite(raw) ? raw : (manualFeeBounds?.heavyMin ?? 0),
          manualFeeBounds,
        );
        return `${opt.label} (AED ${v})`;
      }
      return opt.label;
    })
    .join(", ");
}

export function draftPrimaryDbService(
  draft: PetGroomingDraft,
): Database["public"]["Enums"]["grooming_service"] | null {
  const primaryCb = resolvePrimaryGroomingCheckbox(
    draft.selectedServices.filter(isGroomingPricingCheckbox),
  );
  return primaryCb ? groomingPricingCheckboxToDbService(primaryCb) : null;
}

export function buildDraftNotes(
  draft: PetGroomingDraft,
  manualFeeBounds: GroomingManualFeeBounds | null | undefined,
  isComplimentary: boolean,
  computedOriginalAed?: number | null,
): string {
  const selectedServiceLabels = draftServiceLabels(draft, manualFeeBounds);
  const pct = normalizedDiscountPct(draft.discountPct);
  const priceNum = parseFloat(draft.price);
  const serviceRate = computedOriginalAed ?? 0;
  const baseForCharge = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null;
  const originalForNote =
    baseForCharge != null ? baseForCharge.toFixed(2) : String(serviceRate ?? "0");
  const estPickup = estimatedPickupFromStartAndDuration(draft.apptTime, draft.durationMin);
  const metaNotes = [
    selectedServiceLabels ? `Services: ${selectedServiceLabels}` : null,
    `Grooming date: ${format(draft.groomingDate, "yyyy-MM-dd")}`,
    `Estimated pickup: ${estPickup}`,
    !isComplimentary && pct > 0
      ? `Discount: ${pct}% (original AED ${originalForNote})`
      : null,
  ].filter(Boolean);
  return [draft.visitNotes.trim(), ...metaNotes].filter(Boolean).join("\n");
}

export type GroomingDraftInsertPayload = {
  pet_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  station_id: string | null;
  service: Database["public"]["Enums"]["grooming_service"];
  owner_id: string;
  groomer_id: null;
  grooming_notes: string | null;
  price: number;
  notes: string | null;
  booking_id: string | null;
  payment_method: GroomingPaymentMethod | null;
  dog_size: DogSizeFormValue;
};

export function buildInsertFromDraft(args: {
  draft: PetGroomingDraft;
  ownerId: string;
  bookingId: string | null;
  paymentMethod: GroomingPaymentMethod | null;
  manualFeeBounds: GroomingManualFeeBounds | null | undefined;
  isComplimentary: boolean;
  computedOriginalAed?: number | null;
}): GroomingDraftInsertPayload | { error: string } {
  const { draft, ownerId, bookingId, paymentMethod, manualFeeBounds, isComplimentary } = args;
  if (draft.selectedServices.length === 0) {
    return { error: "Select at least one service." };
  }
  if (!/^\d{2}:\d{2}$/.test(draft.apptTime)) {
    return { error: "Enter a valid appointment time." };
  }
  if (!draft.dogSize) {
    return { error: "Select dog size so pricing can load from the rate card." };
  }
  const primaryService = draftPrimaryDbService(draft);
  if (!primaryService) {
    return { error: "Could not resolve a valid service. Please reselect services." };
  }
  const priceNum = parseFloat(draft.price);
  const serviceRate = args.computedOriginalAed ?? 0;
  const baseForCharge = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null;
  const fallbackBase = typeof serviceRate === "number" && serviceRate >= 0 ? serviceRate : null;
  const basePrice = baseForCharge ?? fallbackBase;
  const finalPrice = isComplimentary
    ? 0
    : basePrice != null
      ? Number((basePrice * (1 - normalizedDiscountPct(draft.discountPct) / 100)).toFixed(2))
      : NaN;
  if (!isComplimentary && (Number.isNaN(finalPrice) || finalPrice < 0)) {
    return { error: "Price is not loaded yet. Wait a moment or enter it manually." };
  }
  return {
    pet_id: draft.petId,
    appointment_date: format(draft.appointmentDate, "yyyy-MM-dd"),
    appointment_time: groomingTimeToDb(draft.apptTime),
    duration_minutes: draft.durationMin,
    station_id: draft.stationId,
    service: primaryService,
    owner_id: ownerId,
    groomer_id: null,
    grooming_notes: draft.groomerName.trim() || null,
    price: finalPrice,
    notes:
      buildDraftNotes(draft, manualFeeBounds, isComplimentary, args.computedOriginalAed) || null,
    booking_id: bookingId,
    payment_method: paymentMethod,
    dog_size: draft.dogSize,
  };
}
