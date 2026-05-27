export type DaycareBillingPath = "single" | "hourly";

export const BILLING_PATH_PREFIX = "BILLING_PATH:";
export const HOURLY_INVOICED_PREFIX = "HOURLY_INVOICED:";

const META_LINE_PREFIXES = [BILLING_PATH_PREFIX, HOURLY_INVOICED_PREFIX, "COLLECTION_BY:"];

/** Strip internal metadata lines from notes shown in the UI. */
export function visibleDaycareNotes(notes: string | null | undefined): string {
  const raw = (notes ?? "").trim();
  if (!raw) return "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !META_LINE_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join("\n")
    .trim();
}

export function parseDaycareBillingPath(
  notes: string | null | undefined,
  packageId: string | null | undefined,
): DaycareBillingPath | "package" {
  if (packageId) return "package";
  const raw = (notes ?? "").trim();
  if (!raw) return "single";
  const marker = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(BILLING_PATH_PREFIX));
  if (!marker) return "single";
  const value = marker.replace(BILLING_PATH_PREFIX, "").trim();
  if (value === "hourly") return "hourly";
  return "single";
}

export function isHourlyBillingInvoiced(notes: string | null | undefined): boolean {
  const raw = (notes ?? "").trim();
  if (!raw) return false;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line.startsWith(HOURLY_INVOICED_PREFIX));
}

export function composeNotesWithHourlyInvoiced(
  notes: string | null | undefined,
  invoiceId: string,
): string | null {
  const cleaned = visibleDaycareNotes(notes);
  const meta = `${HOURLY_INVOICED_PREFIX}${invoiceId}`;
  const billingLine = (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(BILLING_PATH_PREFIX));
  const parts = [cleaned, billingLine, meta].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : meta;
}

export function parseHourlyInvoicedId(notes: string | null | undefined): string | null {
  const raw = (notes ?? "").trim();
  if (!raw) return null;
  const marker = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(HOURLY_INVOICED_PREFIX));
  if (!marker) return null;
  const id = marker.replace(HOURLY_INVOICED_PREFIX, "").trim();
  return id || null;
}

/** Resolve invoice id for a daycare session (direct service_id link or hourly family marker in notes). */
export function resolveDaycareSessionInvoiceId(
  sessionId: string,
  notes: string | null | undefined,
  invoiceIdByServiceId: Map<string, string>,
): string | null {
  const fromService = invoiceIdByServiceId.get(sessionId);
  if (fromService) return fromService;
  return parseHourlyInvoicedId(notes);
}

export type DaycareSessionBillingFlags = {
  sessionId: string;
  notes: string | null | undefined;
  packageId: string | null | undefined;
  checkedIn: boolean;
};

export function isDaycareHourlyPending(
  session: DaycareSessionBillingFlags,
  invoiceIdByServiceId: Map<string, string>,
): boolean {
  if (!session.checkedIn) return false;
  if (parseDaycareBillingPath(session.notes, session.packageId) !== "hourly") return false;
  if (isHourlyBillingInvoiced(session.notes)) return false;
  if (invoiceIdByServiceId.has(session.sessionId)) return false;
  return true;
}

/** Single-day paid path expects an invoice at check-in. */
export function isSingleDayInvoiceMissing(
  session: DaycareSessionBillingFlags,
  invoiceIdByServiceId: Map<string, string>,
): boolean {
  if (!session.checkedIn) return false;
  if (parseDaycareBillingPath(session.notes, session.packageId) !== "single") return false;
  return !resolveDaycareSessionInvoiceId(session.sessionId, session.notes, invoiceIdByServiceId);
}

export function composeNotesWithBillingPath(
  notes: string | null | undefined,
  billingPath: DaycareBillingPath,
): string | null {
  const cleaned = visibleDaycareNotes(notes);
  const meta = `${BILLING_PATH_PREFIX}${billingPath}`;
  return cleaned ? `${cleaned}\n${meta}` : meta;
}

/** Remove hourly-invoiced marker for a deleted invoice; keeps billing path and visible notes. */
export function clearHourlyInvoicedFromNotes(
  notes: string | null | undefined,
  invoiceId: string,
): string | null {
  const raw = (notes ?? "").trim();
  if (!raw) return null;
  const markerPrefix = `${HOURLY_INVOICED_PREFIX}${invoiceId}`;
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(markerPrefix));
  return lines.length > 0 ? lines.join("\n") : null;
}
