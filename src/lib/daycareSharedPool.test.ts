import { describe, expect, it } from "vitest";

import {
  isSharedHouseholdDaycarePool,
  parseSharedPoolFromInvoiceNotes,
  sharedPoolPetLabel,
} from "./daycareSharedPool";

describe("daycareSharedPool", () => {
  it("parses shared pool marker and pet list from invoice notes", () => {
    const parsed = parseSharedPoolFromInvoiceNotes(
      "tracker=PKG-92359 | shared_pool_30_combined | pets=Lotus,Mei Mei,Rocky | authority:x",
    );
    expect(parsed.isSharedPool).toBe(true);
    expect(parsed.petNames).toEqual(["Lotus", "Mei Mei", "Rocky"]);
    expect(sharedPoolPetLabel(parsed.petNames)).toBe("Lotus, Mei Mei, Rocky");
  });

  it("does not treat multi-pet purchase groups as shared pools without the marker", () => {
    expect(
      isSharedHouseholdDaycarePool({
        purchasePetCount: 3,
      }),
    ).toBe(false);
  });

  it("treats packages with the shared pool marker as shared household pools", () => {
    expect(
      isSharedHouseholdDaycarePool({
        invoiceNotes:
          "tracker=PKG-92359 | shared_pool_30_combined | pets=Lotus,Mei Mei,Rocky | authority:x",
        purchasePetCount: 3,
      }),
    ).toBe(true);
  });
});
