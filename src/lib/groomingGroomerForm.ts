export const GROOMER_OTHER_VALUE = "__other__" as const;

export const DEFAULT_GROOMING_GROOMER_NAMES = ["Ruben", "Eliane"] as const;

export type GroomingGroomerOption = {
  id: string;
  name: string;
};

export function splitGroomerStoredValue(
  value: string | null | undefined,
  groomers: GroomingGroomerOption[],
): { choice: string; otherName: string } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { choice: "", otherName: "" };
  if (groomers.some((g) => g.name === trimmed)) {
    return { choice: trimmed, otherName: "" };
  }
  return { choice: GROOMER_OTHER_VALUE, otherName: trimmed };
}

export function resolveGroomerStoredValue(choice: string, otherName: string): string {
  if (!choice) return "";
  if (choice === GROOMER_OTHER_VALUE) return otherName.trim();
  return choice.trim();
}
