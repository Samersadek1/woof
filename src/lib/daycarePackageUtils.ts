import { format, parseISO } from "date-fns";

/** True when package expiry date is before today (YYYY-MM-DD). */
export function daycarePackageIsExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expiryDate < today;
}

export function daycarePackageExpiryLabel(expiryDate: string | null | undefined): string | null {
  if (!expiryDate) return null;
  try {
    return format(parseISO(expiryDate), "d MMM yyyy");
  } catch {
    return expiryDate;
  }
}

export function daycarePackageCreditLabel(pkg: {
  total_days: number;
  days_used: number;
  service_code: string;
  expiry_date?: string | null;
  is_expired?: boolean;
}): string {
  const remaining = pkg.total_days - pkg.days_used;
  const hourly = pkg.service_code === "daycare_hourly" ? " hourly" : "";
  const expired =
    pkg.is_expired ?? daycarePackageIsExpired(pkg.expiry_date ?? null);
  const expirySuffix =
    expired && pkg.expiry_date
      ? ` · expired ${daycarePackageExpiryLabel(pkg.expiry_date)}`
      : "";
  return `Use credit (${remaining} remaining${hourly}${expirySuffix})`;
}
