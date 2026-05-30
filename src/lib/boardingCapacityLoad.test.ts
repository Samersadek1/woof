import { describe, expect, it } from "vitest";
import { woofDogRoomLoad } from "./boardingCapacityLoad";

describe("woofDogRoomLoad", () => {
  it("maps sizes like woof_dog_room_load", () => {
    expect(woofDogRoomLoad("small")).toBe(1);
    expect(woofDogRoomLoad("medium")).toBe(2);
    expect(woofDogRoomLoad("large")).toBe(3);
    expect(woofDogRoomLoad(null)).toBe(2);
  });

  it("load total over 2 requires a large room", () => {
    expect(woofDogRoomLoad("small") + woofDogRoomLoad("small")).toBeLessThanOrEqual(2);
    expect(woofDogRoomLoad("medium") + woofDogRoomLoad("medium")).toBeGreaterThan(2);
  });
});
