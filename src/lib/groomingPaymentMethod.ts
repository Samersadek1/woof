export const GROOMING_PAYMENT_METHOD_NONE = "__none__" as const;

export const GROOMING_PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "mamo_pay", label: "Mamo Pay" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "complimentary", label: "Complimentary" },
] as const;

export type GroomingPaymentMethod = (typeof GROOMING_PAYMENT_METHOD_OPTIONS)[number]["value"];

export function parseGroomingPaymentMethodSelectValue(
  value: string,
): GroomingPaymentMethod | null {
  if (value === GROOMING_PAYMENT_METHOD_NONE) return null;
  return value as GroomingPaymentMethod;
}

export function groomingPaymentMethodLabel(
  method: string | null | undefined,
): string {
  if (!method) return "—";
  const found = GROOMING_PAYMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return found?.label ?? method;
}
