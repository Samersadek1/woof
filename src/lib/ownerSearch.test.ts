import { describe, expect, it } from "vitest";
import {
  buildOwnerColumnOrFilter,
  ownerMatchesSearch,
  ownerSearchScore,
  ownerSearchTokens,
} from "./ownerSearch";

describe("ownerSearchTokens", () => {
  it("splits on spaces", () => {
    expect(ownerSearchTokens("John Smith")).toEqual(["john", "smith"]);
  });

  it("splits on slashes", () => {
    expect(ownerSearchTokens("Elin/Maria")).toEqual(["elin", "maria"]);
  });
});

describe("ownerMatchesSearch", () => {
  const john = { first_name: "John", last_name: "Smith", phone: "0501111111", pets: [] };
  const elin = {
    first_name: "Elin/Maria",
    last_name: "Haugnaess",
    phone: null,
    pets: [{ name: "Luna" }],
  };
  const chris = {
    first_name: "Christopher/Andrea",
    last_name: "Hand",
    phone: null,
    pets: [],
  };

  it("matches first name alone", () => {
    expect(ownerMatchesSearch(john, "John")).toBe(true);
  });

  it("matches full name as typed first then last", () => {
    expect(ownerMatchesSearch(john, "John Smith")).toBe(true);
  });

  it("matches full name in reverse word order", () => {
    expect(ownerMatchesSearch(john, "Smith John")).toBe(true);
  });

  it("is case-insensitive and tolerates extra spaces", () => {
    expect(ownerMatchesSearch(john, "  john   smith ")).toBe(true);
  });

  it("rejects unrelated multi-word queries", () => {
    expect(ownerMatchesSearch(john, "John Doe")).toBe(false);
  });

  it("matches slash-compound first names with space-separated typing", () => {
    expect(ownerMatchesSearch(elin, "Elin Maria")).toBe(true);
    expect(ownerMatchesSearch(elin, "Maria Haugnaess")).toBe(true);
    expect(ownerMatchesSearch(elin, "Elin/Maria Haugnaess")).toBe(true);
  });

  it("matches Christopher/Andrea Hand variants", () => {
    expect(ownerMatchesSearch(chris, "Andrea Hand")).toBe(true);
    expect(ownerMatchesSearch(chris, "Christopher Hand")).toBe(true);
    expect(ownerMatchesSearch(chris, "Hand Andrea")).toBe(true);
  });

  it("still matches phone and pet name", () => {
    expect(ownerMatchesSearch(john, "050111")).toBe(true);
    expect(ownerMatchesSearch(elin, "Luna")).toBe(true);
  });
});

describe("ownerSearchScore", () => {
  const john = { first_name: "John", last_name: "Smith", phone: null, pets: [] };

  it("ranks full-name multi-word matches highly", () => {
    expect(ownerSearchScore(john, "John Smith")).toBe(0);
    expect(ownerSearchScore(john, "Smith John")).toBe(0);
  });
});

describe("buildOwnerColumnOrFilter", () => {
  it("ORs each token across name and phone columns", () => {
    expect(buildOwnerColumnOrFilter(["john", "smith"])).toBe(
      "first_name.ilike.%john%,last_name.ilike.%john%,phone.ilike.%john%,first_name.ilike.%smith%,last_name.ilike.%smith%,phone.ilike.%smith%",
    );
  });
});
