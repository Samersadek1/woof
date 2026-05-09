import type { Json } from "@/integrations/supabase/types";

/** Stored shape for `pets.special_alerts` (jsonb). */
export type PetSpecialAlertsShape = {
  aggressive_muzzle: boolean;
  anxious: boolean;
  medical: boolean;
  elderly: boolean;
  other_text: string;
};

export const EMPTY_PET_ALERTS: PetSpecialAlertsShape = {
  aggressive_muzzle: false,
  anxious: false,
  medical: false,
  elderly: false,
  other_text: "",
};

export const PET_ALERT_LABELS = {
  aggressive_muzzle: "Aggressive / Needs muzzle",
  anxious: "Anxious / Nervous",
  medical: "Special medical needs",
  elderly: "Elderly / Handle with care",
} as const;

export function parsePetSpecialAlerts(raw: Json | null | undefined): PetSpecialAlertsShape {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_PET_ALERTS };
  }
  const o = raw as Record<string, unknown>;
  return {
    aggressive_muzzle: Boolean(o.aggressive_muzzle),
    anxious: Boolean(o.anxious),
    medical: Boolean(o.medical),
    elderly: Boolean(o.elderly),
    other_text: typeof o.other_text === "string" ? o.other_text : "",
  };
}

export function petHasSpecialAlerts(shape: PetSpecialAlertsShape): boolean {
  if (shape.aggressive_muzzle || shape.anxious || shape.medical || shape.elderly) return true;
  return shape.other_text.trim().length > 0;
}

/** Lines for UI banners (checkbox labels + optional other). */
export function petAlertBannerLines(shape: PetSpecialAlertsShape): string[] {
  if (!petHasSpecialAlerts(shape)) return [];
  const lines: string[] = [];
  if (shape.aggressive_muzzle) lines.push(PET_ALERT_LABELS.aggressive_muzzle);
  if (shape.anxious) lines.push(PET_ALERT_LABELS.anxious);
  if (shape.medical) lines.push(PET_ALERT_LABELS.medical);
  if (shape.elderly) lines.push(PET_ALERT_LABELS.elderly);
  const other = shape.other_text.trim();
  if (other) lines.push(`Other: ${other}`);
  return lines;
}

export function serializePetSpecialAlerts(shape: PetSpecialAlertsShape): Json | null {
  if (!petHasSpecialAlerts(shape)) return null;
  return {
    aggressive_muzzle: !!shape.aggressive_muzzle,
    anxious: !!shape.anxious,
    medical: !!shape.medical,
    elderly: !!shape.elderly,
    other_text: shape.other_text.trim() ? shape.other_text.trim() : null,
  };
}

export function bookingAnyPetHasAlerts(b: {
  booking_pets: { pets?: { special_alerts?: Json | null } | null }[];
}): boolean {
  return b.booking_pets.some((bp) =>
    petHasSpecialAlerts(parsePetSpecialAlerts(bp.pets?.special_alerts)),
  );
}
