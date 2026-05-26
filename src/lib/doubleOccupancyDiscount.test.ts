import { describe, expect, it } from "vitest";

import {
  calculateDoubleOccupancyDiscountAed,
  DOUBLE_OCCUPANCY_DISCOUNT_RATE,
} from "./doubleOccupancyDiscount";

describe("doubleOccupancyDiscount", () => {
  it("returns 0 for single-pet stays", () => {
    expect(calculateDoubleOccupancyDiscountAed(200, 1)).toBe(0);
  });

  it("returns 15% of boarding subtotal for two or more pets", () => {
    expect(calculateDoubleOccupancyDiscountAed(200, 2)).toBe(200 * DOUBLE_OCCUPANCY_DISCOUNT_RATE);
    expect(calculateDoubleOccupancyDiscountAed(200, 3)).toBe(30);
  });

  it("returns 0 for zero boarding subtotal", () => {
    expect(calculateDoubleOccupancyDiscountAed(0, 2)).toBe(0);
  });
});
