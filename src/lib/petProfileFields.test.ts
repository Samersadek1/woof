import { describe, expect, it } from "vitest";

import { normalizePetDateOfBirth } from "./petProfileFields";

describe("petProfileFields", () => {
  it("normalizes blank date of birth to null", () => {
    expect(normalizePetDateOfBirth({ date_of_birth: "" }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: "   " }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: null }).date_of_birth).toBeNull();
    expect(normalizePetDateOfBirth({ date_of_birth: "2022-09-23" }).date_of_birth).toBe(
      "2022-09-23",
    );
  });
});
