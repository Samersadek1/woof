import { describe, expect, it } from "vitest";
import {
  boardingTransportFreePromo,
  boardingTransportFreePromoFromRegion,
  normalizeStoredTransportZone,
  privateDubaiOverCapacity,
  regionToTransportZone,
  transportPricingKey,
  transportRegionLabel,
  transportZoneLabel,
  transportQuantityForPets,
} from "./transportPricing";

describe("transportPricing", () => {
  it("maps zones to canonical pricing keys", () => {
    expect(transportPricingKey("dubai_shared")).toBe("transport_dubai_shared");
    expect(transportPricingKey("dubai_private")).toBe("transport_dubai");
    expect(transportPricingKey("abudhabi")).toBe("transport_abudhabi");
    expect(transportPricingKey("complimentary")).toBe("transport_complimentary");
    expect(transportPricingKey("free")).toBe("transport_free");
  });

  it("renders short labels for transport zones", () => {
    expect(transportZoneLabel("dubai_shared")).toBe("Dubai (shared)");
    expect(transportZoneLabel("dubai_private")).toBe("Dubai (private)");
    expect(transportZoneLabel("abudhabi")).toBe("Abu Dhabi");
  });

  it("normalizes legacy stored zone values", () => {
    expect(normalizeStoredTransportZone("dubai")).toBe("dubai_private");
    expect(normalizeStoredTransportZone("abu dhabi")).toBe("abudhabi");
    expect(normalizeStoredTransportZone("dubai-shared")).toBe("dubai_shared");
    expect(normalizeStoredTransportZone("no_charge")).toBe("complimentary");
    expect(normalizeStoredTransportZone("unknown-value")).toBeNull();
  });

  it("flags private Dubai trips above capacity", () => {
    expect(privateDubaiOverCapacity("dubai_private", 4)).toBe(true);
    expect(privateDubaiOverCapacity("dubai_private", 3)).toBe(false);
    expect(privateDubaiOverCapacity("complimentary", 10)).toBe(false);
  });

  it("keeps zero-quantity behavior for phase-2 transport pricing", () => {
    expect(transportQuantityForPets("dubai_shared", 2)).toBe(0);
    expect(transportQuantityForPets("abudhabi", 1)).toBe(0);
  });

  it("maps boarding transport regions consistently", () => {
    expect(regionToTransportZone("dubai")).toBe("dubai_shared");
    expect(regionToTransportZone("abudhabi")).toBe("abudhabi");
    expect(regionToTransportZone("other")).toBe("abudhabi");
    expect(transportRegionLabel("other")).toBe("Other");
  });

  it("applies long-stay transport promos by region", () => {
    expect(boardingTransportFreePromoFromRegion(5, "dubai")).toEqual({
      applies: true,
      notice: "🎉 Free transport",
    });
    expect(boardingTransportFreePromoFromRegion(10, "abudhabi").applies).toBe(true);
    expect(boardingTransportFreePromoFromRegion(4, "dubai").applies).toBe(false);
  });

  it("preserves deprecated zone-based promo logic", () => {
    expect(boardingTransportFreePromo(5, "dubai_shared").applies).toBe(true);
    expect(boardingTransportFreePromo(10, "abudhabi").applies).toBe(true);
    expect(boardingTransportFreePromo(3, "abudhabi").applies).toBe(false);
  });
});
