import { format, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type VaccinationRowDb = Database["public"]["Tables"]["vaccinations"]["Row"];

/** Canonical default vaccines shown on every pet profile table */
export const DEFAULT_VACCINE_LABELS = ["Bordetella", "Distemper", "Rabies"] as const;

export function vaccineBaseName(name: string): string {
  return name.split("(")[0].trim().toLowerCase();
}

export function matchesDefaultVaccine(vaccineName: string, defaultLabel: string): boolean {
  return vaccineBaseName(vaccineName) === defaultLabel.toLowerCase();
}

/**
 * Assigns saved vaccinations to default slots (first match wins) and returns the rest as extras.
 */
export function partitionVaccinationsForDefaults(saved: VaccinationRowDb[]): {
  defaultSlots: { label: (typeof DEFAULT_VACCINE_LABELS)[number]; match?: VaccinationRowDb }[];
  extras: VaccinationRowDb[];
} {
  const consumed = new Set<string>();
  const defaultSlots = DEFAULT_VACCINE_LABELS.map((label) => {
    const match = saved.find(
      (s) => !consumed.has(s.id) && matchesDefaultVaccine(s.vaccine_name, label),
    );
    if (match) consumed.add(match.id);
    return { label, match };
  });
  const extras = saved.filter((s) => !consumed.has(s.id));
  return { defaultSlots, extras };
}

export function toDateInputValue(isoDate: string): string {
  if (!isoDate) return "";
  const d = isoDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function formatExpiryDDMMYYYY(isoDate: string): string {
  if (!isoDate) return "—";
  try {
    return format(parseISO(isoDate.length >= 10 ? isoDate.slice(0, 10) : isoDate), "dd/MM/yyyy");
  } catch {
    return isoDate;
  }
}

export const USER_STATUS_LABEL = {
  valid: "Valid",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
} as const;

/** Compact line for owner profile pet cards */
export function petVaccinationSummaryLine(vaccinations: VaccinationRowDb[]): string {
  const { defaultSlots, extras } = partitionVaccinationsForDefaults(vaccinations);
  const parts = defaultSlots.map(({ label, match }) => {
    if (!match?.expiry_date) return `${label}: —`;
    return `${label}: ${formatExpiryDDMMYYYY(match.expiry_date)}`;
  });
  if (extras.length > 0) {
    parts.push(
      extras.length === 1
        ? `${extras[0].vaccine_name}: ${formatExpiryDDMMYYYY(extras[0].expiry_date)}`
        : `+${extras.length} other vaccine${extras.length > 1 ? "s" : ""}`,
    );
  }
  return parts.join(" · ");
}
