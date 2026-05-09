export const GROOMING_PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
] as const;

export type GroomingPaymentMethod = (typeof GROOMING_PAYMENT_METHOD_OPTIONS)[number]["value"];

export function groomingPaymentMethodLabel(
  method: string | null | undefined,
): string {
  if (!method) return "—";
  const found = GROOMING_PAYMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return found?.label ?? method;
}
