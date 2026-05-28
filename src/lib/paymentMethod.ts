import type { Database } from "@/integrations/supabase/types";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExternalPaymentMethod = Exclude<PaymentMethod, "wallet">;
type TransactionType = Database["public"]["Enums"]["transaction_type"];

export const INVOICE_PAYMENT_METHOD_OPTIONS = [
  { value: "wallet", label: "Wallet" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "payment_link", label: "Payment Link" },
] as const satisfies ReadonlyArray<{ value: PaymentMethod; label: string }>;

export const WALLET_TOPUP_PAYMENT_METHOD_OPTIONS = [
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
] as const satisfies ReadonlyArray<{ value: ExternalPaymentMethod; label: string }>;

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const found = INVOICE_PAYMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return found?.label ?? method.replace(/_/g, " ");
}

export function invoicePaymentMethodToTransactionType(
  method: ExternalPaymentMethod,
): TransactionType {
  switch (method) {
    case "card":
      return "card_payment";
    case "cash":
      return "cash_payment";
    case "bank_transfer":
      return "bank_transfer_payment";
    case "payment_link":
      return "payment_link_payment";
  }
}
