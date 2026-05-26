import { describe, expect, it } from "vitest";
import {
  largestDogSizeFormValue,
  petSizeToDogSizeFormValue,
  resolveDogSizeForSelectedPets,
} from "./dogSizeForm";

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

  it("resolveDogSizeForSelectedPets prefers manual selection", () => {
    const pets = [
      { id: "a", name: "Alf", size: "medium" as const },
      { id: "b", name: "Bo", size: "small" as const },
    ];
    expect(
      resolveDogSizeForSelectedPets(["a", "b"], pets, "Extra Large"),
    ).toEqual({ size: "Extra Large", missingProfilePetNames: [] });
  });

  it("resolveDogSizeForSelectedPets derives from profile when every pet has size", () => {
    const pets = [
      { id: "a", name: "Alf", size: "medium" as const },
      { id: "b", name: "Bo", size: "small" as const },
    ];
    expect(resolveDogSizeForSelectedPets(["a", "b"], pets, null)).toEqual({
      size: "Medium",
      missingProfilePetNames: [],
    });
  });

  it("resolveDogSizeForSelectedPets requires manual size when profile is missing", () => {
    const pets = [{ id: "a", name: "Gipsy", size: null }];
    expect(resolveDogSizeForSelectedPets(["a"], pets, null)).toEqual({
      size: null,
      missingProfilePetNames: ["Gipsy"],
    });
  });
});
