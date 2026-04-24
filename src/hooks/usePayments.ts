import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Extract<Database["public"]["Enums"]["payment_method"], "cash" | "card">;

interface WalletPaymentArgs {
  invoiceId: string;
  performedBy: string;
}

interface CashCardPaymentArgs {
  invoiceId: string;
  method: PaymentMethod;
  performedBy: string;
  note?: string;
}

function invalidateBilling(qc: ReturnType<typeof useQueryClient>, invoiceId: string, ownerId?: string) {
  qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
  qc.invalidateQueries({ queryKey: ["invoices"] });
  qc.invalidateQueries({ queryKey: ["wallet"] });
  qc.invalidateQueries({ queryKey: ["statement"] });
  if (ownerId) {
    qc.invalidateQueries({ queryKey: ["wallet_transactions", ownerId] });
    qc.invalidateQueries({ queryKey: ["owners", ownerId] });
  }
}

export function useProcessWalletPayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, performedBy }: WalletPaymentArgs) => {
      const { data, error } = await supabase.rpc("process_wallet_payment", {
        p_invoice_id: invoiceId,
        p_performed_by: performedBy,
      });
      if (error) throw error;

      const result = data as {
        success?: boolean;
        error?: string;
        amount_charged?: number;
        new_balance?: number;
        owner_id?: string;
      };
      if (result?.success === false) {
        throw new Error(result.error || "Wallet payment failed.");
      }
      return result;
    },
    onSuccess: (data, vars) => {
      invalidateBilling(qc, vars.invoiceId, data?.owner_id);
    },
  });
}

export function useRecordCashOrCardPayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, method, performedBy, note }: CashCardPaymentArgs) => {
      const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .select("id, owner_id, total, total_aed")
        .eq("id", invoiceId)
        .single();
      if (invoiceErr) throw invoiceErr;

      const { data: owner, error: ownerErr } = await supabase
        .from("owners")
        .select("wallet_balance")
        .eq("id", invoice.owner_id)
        .single();
      if (ownerErr) throw ownerErr;

      const amount = invoice.total_aed ?? invoice.total ?? 0;
      const txType: Database["public"]["Enums"]["transaction_type"] =
        method === "cash" ? "cash_payment" : "card_payment";

      const { error: txErr } = await supabase.from("wallet_transactions").insert({
        owner_id: invoice.owner_id,
        invoice_id: invoice.id,
        transaction_type: txType,
        amount,
        balance_after: owner.wallet_balance ?? 0,
        payment_method: method,
        performed_by: performedBy,
        notes: note?.trim() || `Invoice paid by ${method}`,
      });
      if (txErr) throw txErr;

      const { error: payErr } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          payment_method: method,
          amount_paid: amount,
          paid_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (payErr) {
        throw new Error(
          `Payment transaction recorded but invoice status update failed: ${payErr.message}. Please set invoice status to paid manually.`,
        );
      }

      return { ownerId: invoice.owner_id, invoiceId: invoice.id };
    },
    onSuccess: (data) => {
      invalidateBilling(qc, data.invoiceId, data.ownerId);
    },
  });
}
