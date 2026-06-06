import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { payInvoiceFromWallet } from "@/lib/walletInvoicePayment";
import { revertInvoicePayment } from "@/lib/revertInvoicePayment";
import { recordExternalInvoicePayment } from "@/lib/recordExternalInvoicePayment";
import { changeInvoicePaymentMethod } from "@/lib/changeInvoicePaymentMethod";
import { invoiceLedgerQueryKey } from "@/hooks/useInvoiceLedger";
import type { ExternalPaymentMethod } from "@/lib/paymentMethod";

interface WalletPaymentArgs {
  invoiceId: string;
  performedBy: string;
}

interface ExternalPaymentArgs {
  invoiceId: string;
  method: ExternalPaymentMethod;
  performedBy: string;
  amountAed?: number;
  note?: string;
  confirmDuplicate?: boolean;
}

function invalidateBilling(qc: ReturnType<typeof useQueryClient>, invoiceId: string, ownerId?: string) {
  qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
  qc.invalidateQueries({ queryKey: invoiceLedgerQueryKey(invoiceId) });
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
      const result = await payInvoiceFromWallet(supabase, { invoiceId, performedBy });
      if (!result.success) {
        throw new Error(result.error || "Wallet payment failed.");
      }
      return {
        success: true,
        amount_charged: result.amountCharged,
        new_balance: result.newWalletBalance,
        owner_id: result.ownerId,
        partial: result.partial,
      };
    },
    onSuccess: (data, vars) => {
      invalidateBilling(qc, vars.invoiceId, data?.owner_id);
    },
  });
}

export function useRecordExternalPayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ExternalPaymentArgs) => {
      const result = await recordExternalInvoicePayment(supabase, args);
      // A duplicate warning is not an error — surface it so the caller can
      // confirm and retry with confirmDuplicate.
      if (!result.success && !result.duplicate) {
        throw new Error(result.error || "Could not record payment.");
      }
      return result;
    },
    onSuccess: (data, vars) => {
      if (data.success) {
        invalidateBilling(qc, vars.invoiceId, data.ownerId);
      }
    },
  });
}

/** @deprecated Use useRecordExternalPayment */
export const useRecordCashOrCardPayment = useRecordExternalPayment;

export function useRevertInvoicePayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      performedBy,
      reason,
    }: {
      invoiceId: string;
      performedBy: string;
      reason?: string;
    }) => {
      const result = await revertInvoicePayment(supabase, {
        invoiceId,
        performedBy,
        reason,
      });
      if (!result.success) {
        throw new Error(result.error || "Could not revert payment.");
      }
      return result;
    },
    onSuccess: (_data, vars) => {
      invalidateBilling(qc, vars.invoiceId);
    },
  });
}

export function useUpdatePaymentAttribution() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      performedBy,
      invoiceId,
      ownerId,
    }: {
      paymentId: string;
      performedBy: string;
      invoiceId: string;
      ownerId: string;
    }) => {
      const { error } = await supabase
        .from("wallet_transactions")
        .update({ performed_by: performedBy.trim() })
        .eq("id", paymentId);
      if (error) throw error;
      return { invoiceId, ownerId };
    },
    onSuccess: (data) => {
      invalidateBilling(qc, data.invoiceId, data.ownerId);
    },
  });
}

export function useChangePaymentMethod() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      paymentId: string;
      newMethod: ExternalPaymentMethod;
      performedBy: string;
      reason?: string;
      invoiceId: string;
    }) => {
      const result = await changeInvoicePaymentMethod(supabase, args);
      if (!result.success) {
        throw new Error(result.error || "Could not change payment method.");
      }
      return result;
    },
    onSuccess: (data, vars) => {
      invalidateBilling(qc, vars.invoiceId, data.ownerId);
    },
  });
}

export function useConsolidateInvoices() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ownerId,
      invoiceIds,
      performedBy,
    }: {
      ownerId: string;
      invoiceIds: string[];
      performedBy: string;
    }) => {
      const { data, error } = await supabase.rpc("consolidate_owner_invoices", {
        p_owner_id: ownerId,
        p_invoice_ids: invoiceIds,
        p_performed_by: performedBy,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
    },
  });
}
