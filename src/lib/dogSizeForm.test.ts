import { describe, expect, it } from "vitest";
import { largestDogSizeFormValue, petSizeToDogSizeFormValue } from "./dogSizeForm";

describe("dogSizeForm", () => {
  it("maps pet profile enum to form labels", () => {
    expect(petSizeToDogSizeFormValue("small")).toBe("Small");
    expect(petSizeToDogSizeFormValue("medium")).toBe("Medium");
    expect(petSizeToDogSizeFormValue("large")).toBe("Large");
    expect(petSizeToDogSizeFormValue(null)).toBeNull();
  });

  it("picks the largest size for multi-dog stays", () => {
    expect(largestDogSizeFormValue(["Small", "Large"])).toBe("Large");
  });
});
