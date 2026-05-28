import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";

import { daycareCreditTypeLabel } from "@/lib/daycareCredits";
import type { PackageWithDetails } from "../hooks/useDaycare";

function ownerLabel(
  owner: { first_name: string; last_name: string | null } | null | undefined,
): string {
  if (!owner) return "";
  return [owner.first_name, owner.last_name].filter(Boolean).join(" ").trim();
}

function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso.length > 10 ? iso : `${iso}T00:00:00`), "yyyy-MM-dd");
  } catch {
    return iso;
  }
}

function utilizationPct(daysUsed: number, totalDays: number): number | "" {
  if (totalDays <= 0) return "";
  return Math.round((daysUsed / totalDays) * 1000) / 10;
}

export function daycarePackagesExportRows(packages: PackageWithDetails[]) {
  return packages.map((pkg) => {
    const remaining = pkg.total_days - pkg.days_used;
    return {
      Owner: ownerLabel(pkg.owners),
      Pet: pkg.pets?.name ?? "",
      "Package name": pkg.package_name ?? "",
      Type: daycareCreditTypeLabel(pkg.service_code),
      "Total days": pkg.total_days,
      "Days used": pkg.days_used,
      "Days remaining": remaining,
      "Utilization %": utilizationPct(pkg.days_used, pkg.total_days),
      Status: pkg.status ?? "",
      Purchased: formatExportDate(pkg.purchase_date),
      Expires: formatExportDate(pkg.expiry_date),
      "Member tier": pkg.owners?.member_tier ?? "",
      Bonus: pkg.is_bonus ? "Yes" : "No",
      "Credit ID": pkg.id,
    };
  });
}

export function exportDaycarePackagesToExcel(
  packages: PackageWithDetails[],
  fileName = `daycare-packages-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
): void {
  const rows = daycarePackagesExportRows(packages);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Packages");
  XLSX.writeFile(wb, fileName);
}
