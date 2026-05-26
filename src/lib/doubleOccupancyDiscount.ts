import { roundAed } from "./money";

/** Boarding double-occupancy discount when 2+ pets share a room. */
export const DOUBLE_OCCUPANCY_DISCOUNT_RATE = 0.15;

export function calculateDoubleOccupancyDiscountAed(
  boardingSubtotalAed: number,
  petCount: number,
): number {
  if (petCount < 2 || boardingSubtotalAed <= 0) return 0;
  return roundAed(boardingSubtotalAed * DOUBLE_OCCUPANCY_DISCOUNT_RATE);
}
