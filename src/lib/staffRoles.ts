import type { StaffRole } from "@/hooks/useStaff";

export const STAFF_ROLE_OPTIONS: StaffRole[] = [
  "admin",
  "management",
  "booking_coordinator",
  "groomer",
  "kennel_staff",
  "night_staff",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  management: "Management",
  booking_coordinator: "Booking coordinator",
  groomer: "Groomer",
  kennel_staff: "Kennel staff",
  night_staff: "Night staff",
};

export const STAFF_ROLE_BADGE: Record<StaffRole, string> = {
  admin: "bg-rose-50 text-rose-700 border-rose-200",
  management: "bg-amber-50 text-amber-700 border-amber-200",
  booking_coordinator: "bg-blue-50 text-blue-700 border-blue-200",
  groomer: "bg-purple-50 text-purple-700 border-purple-200",
  kennel_staff: "bg-emerald-50 text-emerald-700 border-emerald-200",
  night_staff: "bg-slate-100 text-slate-700 border-slate-200",
};

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLE_OPTIONS);

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return !!value && STAFF_ROLE_SET.has(value);
}

/** Radix Select requires a value that matches a SelectItem — unknown DB roles fall back safely. */
export function normalizeStaffRole(value: string | null | undefined): StaffRole {
  return isStaffRole(value) ? value : "booking_coordinator";
}

export function staffRoleLabel(value: string | null | undefined): string {
  if (isStaffRole(value)) return STAFF_ROLE_LABELS[value];
  if (!value) return "Unknown";
  return value.replace(/_/g, " ");
}

export function staffRoleBadgeClass(value: string | null | undefined): string {
  if (isStaffRole(value)) return STAFF_ROLE_BADGE[value];
  return "bg-muted text-muted-foreground border-border";
}

export function staffMatchesSearch(
  row: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.first_name, row.last_name, row.email, row.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
