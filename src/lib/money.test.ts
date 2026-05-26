import { describe, expect, it } from "vitest";

import { formatAed, formatAedAmount, parseBoundedDecimalInput, roundAed } from "./money";

describe("money", () => {
  it("formatAedAmount shows at least one decimal place", () => {
    expect(formatAedAmount(63)).toBe("63.0");
    expect(formatAedAmount(10.5)).toBe("10.5");
    expect(formatAedAmount(10.125)).toBe("10.125");
  });

  it("formatAed prefixes AED", () => {
    expect(formatAed(31.5)).toBe("AED 31.5");
  });

  it("roundAed is only for final storage boundaries", () => {
    expect(roundAed(31.5555)).toBe(31.556);
  });

  it("parseBoundedDecimalInput keeps decimal hours", () => {
    expect(parseBoundedDecimalInput("1.5", 1, { min: 0.5, max: 48 })).toBe(1.5);
    expect(parseBoundedDecimalInput("", 1, { min: 0.5, max: 48 })).toBe(1);
  });
});
