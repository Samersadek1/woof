import { woofDogRoomLoad } from "@/lib/boardingCapacityLoad";

export type RoomSizeClass = "standard" | "large";
export type BoardingValidationWarning = { code: string; msg: string };

export function computeRequiredRoomClass(
  sizes: (string | null | undefined)[],
  forceLarge = false,
): RoomSizeClass {
  if (forceLarge) return "large";
  const total = sizes.reduce((sum, s) => sum + woofDogRoomLoad(s), 0);
  return total > 2 ? "large" : "standard";
}

export function requiredClassLabel(cls: RoomSizeClass): string {
  return cls === "large" ? "Large" : "Standard";
}

export function formatRequiredClassBanner(
  cls: RoomSizeClass,
  opts?: { hasRestriction?: boolean; petCount?: number; sizes?: string[] },
): string {
  const base = `Needs ${requiredClassLabel(cls).toLowerCase()} room`;
  if (opts?.hasRestriction) return `${base} — large-only restriction`;
  if (opts?.sizes && opts.sizes.length > 0) {
    const summary = opts.sizes.filter(Boolean).join(", ");
    return `${base} — ${opts.petCount ?? opts.sizes.length} dog(s): ${summary}`;
  }
  return base;
}
