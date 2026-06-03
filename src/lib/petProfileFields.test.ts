import { describe, expect, it } from "vitest";

import {
  formatIsoDate,
  isValidIsoDate,
  normalizePetDateOfBirth,
} from "./petProfileFields";

describe("petProfileFields", () => {
  it("normalizes blank date of birth to null", () => {
    expect(normalizePetDateOfBirth({ date_of_birth: "" }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: "   " }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: null }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: "2022-09-23" }).date_of_birth).toBe(
      "2022-09-23",
    );
  });

  it("normalizes corrupted date of birth to null", () => {
    expect(normalizePetDateOfBirth({ date_of_birth: "52914-09-05" }).date_of_birth).toBeNull();
  });

  it("formatIsoDate does not throw on invalid input", () => {
    expect(isValidIsoDate("52914-09-05")).toBe(false);
    expect(formatIsoDate("52914-09-05", "d MMM yyyy")).toBe("—");
    expect(formatIsoDate("2022-09-23", "d MMM yyyy")).toBe("23 Sep 2022");
  });
});
