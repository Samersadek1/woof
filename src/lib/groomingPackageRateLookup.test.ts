import { describe, expect, it } from "vitest";

import {
  deshedCoatTypeFromPetCoat,
  dogSizeFormToPackageSize,
  packageToServiceLookup,
  splashCoatTypeFromPetCoat,
} from "./groomingPackageRateLookup";

describe("groomingPackageRateLookup", () => {
  it("maps dog size form to package size tier", () => {
    expect(dogSizeFormToPackageSize("Small")).toBe("S");
    expect(dogSizeFormToPackageSize("Medium")).toBe("M");
    expect(dogSizeFormToPackageSize("Large")).toBe("L");
    expect(dogSizeFormToPackageSize("Extra Large")).toBe("XL");
  });

  it("maps grande package to grooming_full_service with pet_size", () => {
    const lookup = packageToServiceLookup("grande", "M");
    expect(lookup.service_code).toBe("grooming_full_service");
    expect(lookup.pet_size).toBe("medium");
    expect(lookup.coat_type).toBeNull();
  });

  it("maps deshedding_long to hair_no_more with long coat", () => {
    const lookup = packageToServiceLookup("deshedding_long", "S");
    expect(lookup.service_code).toBe("grooming_hair_no_more");
    expect(lookup.pet_size).toBeNull();
    expect(lookup.coat_type).toBe("long");
  });

  it("splashCoatTypeFromPetCoat maps mid_length to long tier", () => {
    expect(splashCoatTypeFromPetCoat("mid_length")).toBe("long");
    expect(splashCoatTypeFromPetCoat("short")).toBe("short");
  });

  it("deshedCoatTypeFromPetCoat preserves long and mid_length", () => {
    expect(deshedCoatTypeFromPetCoat("long")).toBe("long");
    expect(deshedCoatTypeFromPetCoat("mid_length")).toBe("mid_length");
    expect(deshedCoatTypeFromPetCoat("short")).toBe("short");
  });
});
