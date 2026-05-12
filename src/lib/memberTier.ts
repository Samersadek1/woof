/** Member tier helpers for Silver / Gold / Platinum pricing UX (matches apply_member_discount policy). */

export function memberTierDiscountPct(memberType: string | null | undefined): number {
  switch (memberType) {
    case "silver":
      return 10;
    case "gold":
      return 20;
    case "platinum":
      return 30;
    default:
      return 0;
  }
}

export function memberTierBadgeLabel(memberType: string | null | undefined): string | null {
  if (memberType === "silver") return "🥈 Silver Member";
  if (memberType === "gold") return "🥇 Gold Member";
  if (memberType === "platinum") return "💎 Platinum Member";
  return null;
}

export function memberTierBadgeClassName(memberType: string | null | undefined): string {
  switch (memberType) {
    case "silver":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "gold":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "platinum":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "";
  }
}
