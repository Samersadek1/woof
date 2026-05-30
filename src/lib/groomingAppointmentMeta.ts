/** Physical grooming tables on the floor (calendar columns). */
export const GROOMING_STATION_COUNT = 2;

export const GROOMING_STATION_LABELS = ["Table 1", "Table 2"] as const;

export type GroomingStationNumber = 1 | 2;

export type GroomingStationChoice = GroomingStationNumber | "auto";

const META_PREFIXES = [
  "services:",
  "grooming date:",
  "discount:",
  "estimated pickup:",
  "station:",
] as const;

export function groomingStationLabel(station: GroomingStationNumber): string {
  return GROOMING_STATION_LABELS[station - 1];
}

export function groomingStationColumnKey(station: GroomingStationNumber): string {
  return `station:${station}`;
}

export function parseGroomingStationFromNotes(
  notes: string | null | undefined,
): GroomingStationNumber | null {
  if (!notes) return null;
  const line = notes
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().startsWith("station:"));
  if (!line) return null;
  const raw = line.slice("station:".length).trim();
  if (raw === "1" || /^table\s*1$/i.test(raw)) return 1;
  if (raw === "2" || /^table\s*2$/i.test(raw)) return 2;
  return null;
}

export function formatGroomingStationMetaLine(station: GroomingStationNumber): string {
  return `Station: ${station}`;
}

export function parseGroomingMeta(notes: string | null | undefined): {
  services: string[];
  groomingDate: string | null;
  estimatedPickup: string | null;
  station: GroomingStationNumber | null;
} {
  if (!notes) {
    return { services: [], groomingDate: null, estimatedPickup: null, station: null };
  }
  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const servicesLine = lines.find((l) => l.toLowerCase().startsWith("services:"));
  const groomingDateLine = lines.find((l) =>
    l.toLowerCase().startsWith("grooming date:"),
  );
  const estimatedPickupLine = lines.find((l) =>
    l.toLowerCase().startsWith("estimated pickup:"),
  );
  const services = servicesLine
    ? servicesLine
        .slice("services:".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const groomingDate = groomingDateLine
    ? groomingDateLine.slice("grooming date:".length).trim() || null
    : null;
  const estimatedPickup = estimatedPickupLine
    ? estimatedPickupLine.slice("estimated pickup:".length).trim() || null
    : null;
  return {
    services,
    groomingDate,
    estimatedPickup,
    station: parseGroomingStationFromNotes(notes),
  };
}

/** User-entered visit notes with system meta lines stripped. */
export function userVisitNotesFromStored(notes: string | null): string {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((l) => !META_PREFIXES.some((p) => l.toLowerCase().trimStart().startsWith(p)))
    .join("\n")
    .trim();
}
