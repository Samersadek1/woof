import { describe, expect, it } from "vitest";
import {
  inferImportTier,
  isImportPlaceholderRoom,
  splitFacilityAndPlaceholderRooms,
  sortImportPlaceholderRooms,
} from "./boardingUnknownKennel";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

const placeholderStd = {
  id: "p1",
  wing: "import_placeholder",
  room_number: "UNK-STD",
  notes: "import_placeholder_tier=standard",
  room_type: "standard",
  display_name: "Unknown · Standard",
  is_active: true,
} as Room;

const facilityOxford = {
  id: "f1",
  wing: "oxford",
  room_number: "101",
  notes: "",
  room_type: "standard",
  display_name: "101",
  is_active: true,
} as Room;

describe("boardingUnknownKennel", () => {
  it("detects placeholder rooms", () => {
    expect(isImportPlaceholderRoom(placeholderStd)).toBe(true);
    expect(isImportPlaceholderRoom(facilityOxford)).toBe(false);
  });

  it("infers tier from kennel text", () => {
    expect(inferImportTier("Not Assigned", "dog")).toBe("unknown");
    expect(inferImportTier("Presidential Suite 1", "dog")).toBe("presidential");
    expect(inferImportTier("Cattery Deluxe 2", "cat")).toBe("cattery_deluxe");
  });

  it("splits facility vs placeholder pools", () => {
    const { facility, placeholders } = splitFacilityAndPlaceholderRooms(
      [placeholderStd, facilityOxford],
      "dog",
    );
    expect(facility.map((r) => r.id)).toEqual(["f1"]);
    expect(placeholders.map((r) => r.id)).toEqual(["p1"]);
  });

  it("sorts placeholder rooms for flat calendar display", () => {
    const sorted = sortImportPlaceholderRooms([placeholderStd]);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("p1");
  });

  it("keeps import_placeholder wing out of facility dog pool", () => {
    const { facility } = splitFacilityAndPlaceholderRooms(
      [placeholderStd, facilityOxford],
      "dog",
    );
    expect(facility.every((r) => r.wing !== "import_placeholder")).toBe(true);
  });
});
