/** Grooming appointment workflow (stored in Supabase `grooming_appointments.status`). */

export const GROOMING_WORKFLOW_STATUSES = [
  "new",
  "checked_in",
  "in_progress",
  "completed",
  "paid",
] as const;

export type GroomingWorkflowStatus = (typeof GROOMING_WORKFLOW_STATUSES)[number];

const WORKFLOW_ORDER: GroomingWorkflowStatus[] = [
  "new",
  "checked_in",
  "in_progress",
  "completed",
  "paid",
];

/** Legacy DB value → workflow step */
export function normalizeGroomingWorkflowStatus(raw: string): GroomingWorkflowStatus | "cancelled" | "other" {
  if (raw === "scheduled") return "new";
  if (raw === "cancelled") return "cancelled";
  if ((GROOMING_WORKFLOW_STATUSES as readonly string[]).includes(raw)) {
    return raw as GroomingWorkflowStatus;
  }
  return "other";
}

export function workflowStatusLabel(
  raw: string,
): string {
  const n = normalizeGroomingWorkflowStatus(raw);
  switch (n) {
    case "new":
      return "New";
    case "checked_in":
      return "Checked In";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Badge styling for workflow + cancelled */
export function workflowStatusBadgeClass(raw: string): string {
  const n = normalizeGroomingWorkflowStatus(raw);
  switch (n) {
    case "new":
      return "bg-slate-100 text-slate-800 border-slate-300";
    case "checked_in":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "in_progress":
      return "bg-orange-100 text-orange-900 border-orange-300";
    case "completed":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "paid":
      return "bg-emerald-900 text-emerald-50 border-emerald-950";
    case "cancelled":
      return "bg-gray-200 text-gray-800 border-gray-400";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function previousWorkflowStatus(
  current: GroomingWorkflowStatus,
): GroomingWorkflowStatus | null {
  const idx = WORKFLOW_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return WORKFLOW_ORDER[idx - 1]!;
}

/** Columns present on live `grooming_appointments` (Postgres). Omit until migrated. */
const HAS_CHECKED_IN_AT = false;
const HAS_PAID_AT = false;

/** Clear timestamps that occur after the target step when undoing */
export function timestampClearsForUndoTo(
  target: GroomingWorkflowStatus,
): Record<string, null> {
  switch (target) {
    case "new":
      return {
        ...(HAS_CHECKED_IN_AT ? { checked_in_at: null } : {}),
        in_progress_at: null,
        completed_at: null,
        ...(HAS_PAID_AT ? { paid_at: null } : {}),
      };
    case "checked_in":
      return {
        in_progress_at: null,
        completed_at: null,
        ...(HAS_PAID_AT ? { paid_at: null } : {}),
      };
    case "in_progress":
      return {
        completed_at: null,
        ...(HAS_PAID_AT ? { paid_at: null } : {}),
      };
    case "completed":
      return HAS_PAID_AT ? { paid_at: null } : {};
    default:
      return {};
  }
}

export function timestampSetsForForwardStep(
  to: GroomingWorkflowStatus,
  isoNow: string,
): Partial<{
  checked_in_at: string;
  in_progress_at: string;
  completed_at: string;
  paid_at: string;
}> {
  switch (to) {
    case "checked_in":
      return HAS_CHECKED_IN_AT ? { checked_in_at: isoNow } : {};
    case "in_progress":
      return { in_progress_at: isoNow };
    case "completed":
      return { completed_at: isoNow };
    case "paid":
      return HAS_PAID_AT ? { paid_at: isoNow } : {};
    default:
      return {};
  }
}
