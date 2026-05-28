import type { Database } from "@/integrations/supabase/types";

type ServiceCode = Database["public"]["Enums"]["service_code"];

/** Service codes shown in Daycare packages, planner package pickers, and exports. */
export const DAYCARE_CREDIT_CODES: ServiceCode[] = [
  "daycare_full_day",
  "daycare_half_day",
  "daycare_hourly",
];

export type DaycareCreditCode = (typeof DAYCARE_CREDIT_CODES)[number];

export function isDaycareCreditCode(code: string): code is DaycareCreditCode {
  return (DAYCARE_CREDIT_CODES as string[]).includes(code);
}

export function daycareCreditTypeLabel(code: string): string {
  if (code === "daycare_hourly") return "Hourly";
  if (code === "daycare_half_day") return "Half day";
  if (code === "daycare_full_day") return "Full day";
  return code;
}
