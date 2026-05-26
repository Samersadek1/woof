/** AED amounts: store and display up to three decimal places (fils + extra precision). */
export const AED_DECIMAL_DIGITS = 3;

export function roundAed(amount: number): number {
  const factor = 10 ** AED_DECIMAL_DIGITS;
  return Math.round(amount * factor) / factor;
}

/** Format a numeric AED amount for display (no currency prefix). */
export function formatAedAmount(amount: number): string {
  return amount.toLocaleString("en-AE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: AED_DECIMAL_DIGITS,
  });
}

export function formatAed(amount: number): string {
  return `AED ${formatAedAmount(amount)}`;
}

export function parseBoundedDecimalInput(
  raw: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}
