import { roundAed } from "@/lib/money";

export type InvoiceDiscountMode = "percent" | "flat";

export function isPercentDiscountAdjustmentType(adjustmentType: string): boolean {
  return adjustmentType === "discount_override";
}

/** Flat AED discount from subtotal and percentage (capped at subtotal). */
export function discountFlatFromPercent(subtotal: number, percent: number): number {
  if (subtotal <= 0 || percent <= 0) return 0;
  const pct = Math.min(100, percent);
  return roundAed(Math.min(subtotal, (subtotal * pct) / 100));
}

/** Resolve staff-entered discount to a flat AED amount stored on the adjustment. */
export function resolveAdjustmentDiscountAmount(
  mode: InvoiceDiscountMode,
  value: number,
  subtotal: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (mode === "percent") return discountFlatFromPercent(subtotal, value);
  return roundAed(Math.min(subtotal > 0 ? subtotal : value, value));
}

export function discountReasonWithMode(
  reason: string,
  mode: InvoiceDiscountMode,
  enteredValue: number,
): string {
  const trimmed = reason.trim();
  if (mode !== "percent" || enteredValue <= 0) return trimmed;
  const suffix = `(${enteredValue}%)`;
  if (trimmed.includes(suffix)) return trimmed;
  return trimmed ? `${trimmed} ${suffix}` : suffix;
}
