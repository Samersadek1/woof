import { roundAed } from "./money";

/** Boarding night rows are replaced on stay date changes; addons/transport lines are kept. */
export function isBoardingNightLineItem(line: {
  service_type: string | null;
  description: string;
  pricing_key?: string | null;
}): boolean {
  if (line.service_type !== "boarding") return false;
  if (line.pricing_key === "boarding_night") return true;
  return /\snight(s)?(\s|$)/i.test(line.description);
}

export function deriveInvoiceStatusAfterRecalc(
  currentStatus: string,
  amountPaid: number,
  grandTotal: number,
): string {
  if (currentStatus === "voided" || currentStatus === "cancelled") return currentStatus;

  const paid = roundAed(amountPaid);
  const total = roundAed(grandTotal);

  if (total <= 0) {
    return paid > 0 ? "paid" : currentStatus === "draft" ? "draft" : currentStatus;
  }
  if (paid >= total) return "paid";
  if (paid > 0) {
    return currentStatus === "overdue" ? "overdue" : "partially_paid";
  }
  if (currentStatus === "paid" || currentStatus === "partially_paid") {
    return "outstanding";
  }
  return currentStatus;
}
