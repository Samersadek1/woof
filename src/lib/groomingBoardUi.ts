import { format, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import {
  activeLinkedStayLabel,
  type GroomingStayLinkInfo,
} from "@/lib/groomingBookingLinkSearch";
import { groomingPaymentMethodLabel } from "@/lib/groomingPaymentMethod";
import { normalizeGroomingWorkflowStatus } from "@/lib/groomingWorkflow";

export type GroomingLinkedBookingInfo = GroomingStayLinkInfo;

export { activeLinkedStayLabel };

/** Left border accent per station column (no colour on grooming_stations table). */
export const STATION_ACCENT_CLASSES = [
  "border-l-blue-500",
  "border-l-violet-500",
  "border-l-teal-500",
  "border-l-orange-500",
  "border-l-rose-500",
  "border-l-cyan-500",
  "border-l-amber-500",
  "border-l-indigo-500",
] as const;

export function stationAccentClass(stationIndex: number): string {
  return STATION_ACCENT_CLASSES[stationIndex % STATION_ACCENT_CLASSES.length];
}

export function groomingStatusBadgeClass(status: string): string {
  const n = normalizeGroomingWorkflowStatus(status);
  switch (n) {
    case "new":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "checked_in":
      return "bg-indigo-100 text-indigo-900 border-indigo-300";
    case "in_progress":
      return "bg-amber-100 text-amber-950 border-amber-300";
    case "completed":
      return "bg-green-100 text-green-900 border-green-300";
    case "paid":
      return "bg-emerald-100 text-emerald-950 border-emerald-400";
    case "cancelled":
      return "bg-gray-100 text-gray-600 border-gray-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function formatMustFinishBy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), "EEE d MMM, HH:mm");
  } catch {
    return null;
  }
}

/** Floating job is due soon when within 48h of must_finish_by. */
export function isGroomingDueSoon(mustFinishBy: string | null | undefined): boolean {
  if (!mustFinishBy) return false;
  try {
    const deadline = parseISO(mustFinishBy).getTime();
    const now = Date.now();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    return now >= deadline - fortyEightHoursMs;
  } catch {
    return false;
  }
}

export function formatTimeRange(
  startTime: string | null,
  durationMinutes: number | null | undefined,
): string {
  if (!startTime) return "—";
  const startSlice = startTime.slice(0, 5);
  const startParts = startSlice.split(":").map(Number);
  const startMin = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const dur = durationMinutes ?? 60;
  const endMin = startMin + dur;
  const endH = Math.floor(endMin / 60);
  const endM = endMin % 60;
  const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${startSlice} – ${end}`;
}

export function petSizeLabel(size: string | null | undefined): string {
  if (!size) return "";
  return size.charAt(0).toUpperCase() + size.slice(1);
}

export function groomingBoardPaymentLabel(args: {
  status: string;
  payment_method: string | null | undefined;
  invoice_status?: string | null;
}): string {
  const workflow = normalizeGroomingWorkflowStatus(args.status);
  if (workflow === "paid") return "Paid";
  if (args.invoice_status === "paid") return "Paid";
  if (args.invoice_status === "partially_paid") return "Partially paid";
  if (args.payment_method === "complimentary") return "Complimentary";
  if (args.payment_method) return groomingPaymentMethodLabel(args.payment_method);
  if (args.invoice_status === "outstanding" || args.invoice_status === "overdue") {
    return "Unpaid";
  }
  if (workflow === "completed") return "Unpaid";
  return "—";
}

export function groomingBoardPaymentBadgeClass(args: {
  status: string;
  payment_method: string | null | undefined;
  invoice_status?: string | null;
}): string {
  const label = groomingBoardPaymentLabel(args);
  if (label === "Paid" || label === "Complimentary") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (label === "Partially paid") {
    return "border-amber-300 bg-amber-50 text-amber-950";
  }
  if (label === "Unpaid") {
    return "border-rose-300 bg-rose-50 text-rose-900";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function groomingCardGroomerLabel(args: {
  groomerId: string | null | undefined;
  groomingNotes: string | null | undefined;
  staffNameById?: ReadonlyMap<string, string>;
}): string {
  if (args.groomerId) {
    const assigned = args.staffNameById?.get(args.groomerId);
    if (assigned) return assigned;
  }
  const notes = args.groomingNotes?.trim();
  if (notes) return notes;
  return "—";
}
