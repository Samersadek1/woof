import { describe, expect, it } from "vitest";
import {
  discountFlatFromPercent,
  discountReasonWithMode,
  resolveAdjustmentDiscountAmount,
} from "./invoiceAdjustmentDiscount";

describe("invoiceAdjustmentDiscount", () => {
  it("computes flat discount from percent of subtotal", () => {
    expect(discountFlatFromPercent(1000, 10)).toBe(100);
    expect(discountFlatFromPercent(105, 15)).toBe(15.75);
  });

  it("caps percent discount at subtotal", () => {
    expect(discountFlatFromPercent(50, 200)).toBe(50);
  });

  it("resolves flat mode directly", () => {
    expect(resolveAdjustmentDiscountAmount("flat", 25, 100)).toBe(25);
    expect(resolveAdjustmentDiscountAmount("flat", 150, 100)).toBe(100);
  });

  it("resolves percent mode via subtotal", () => {
    expect(resolveAdjustmentDiscountAmount("percent", 10, 200)).toBe(20);
  });

  it("appends percent suffix to reason", () => {
    expect(discountReasonWithMode("EPC discount", "percent", 10)).toBe("EPC discount (10%)");
    expect(discountReasonWithMode("EPC discount (10%)", "percent", 10)).toBe(
      "EPC discount (10%)",
    );
    expect(discountReasonWithMode("Flat promo", "flat", 50)).toBe("Flat promo");
  });
});
