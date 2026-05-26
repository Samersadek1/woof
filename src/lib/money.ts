/** AED amounts: store and display three decimal places (fils + extra precision). */
export const AED_DECIMAL_DIGITS = 3;

export function roundAed(amount: number): number {
  const factor = 10 ** AED_DECIMAL_DIGITS;
  return Math.round(amount * factor) / factor;
}

export function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString("en-AE", {
    minimumFractionDigits: AED_DECIMAL_DIGITS,
    maximumFractionDigits: AED_DECIMAL_DIGITS,
  })}`;
}
