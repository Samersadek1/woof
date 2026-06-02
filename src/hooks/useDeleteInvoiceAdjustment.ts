import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { billingKeys } from "@/hooks/useBilling";
import { canDeleteInvoiceAdjustments, syncInvoiceDiscountTotals } from "@/lib/invoiceRecalc";
import { toast } from "sonner";

export interface DeleteInvoiceAdjustmentInput {
  adjustmentId: string;
  invoiceId: string;
  ownerId: string;
}

export function useDeleteInvoiceAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteInvoiceAdjustmentInput) => {
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", input.invoiceId)
        .single();
      if (invErr) throw invErr;
      if (!canDeleteInvoiceAdjustments(invoice.status)) {
        throw new Error("Discounts cannot be removed from this invoice status.");
      }

      const { error: delErr } = await supabase
        .from("billing_adjustments")
        .delete()
        .eq("id", input.adjustmentId)
        .eq("invoice_id", input.invoiceId);
      if (delErr) throw delErr;

      await syncInvoiceDiscountTotals(input.invoiceId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({
        queryKey: billingKeys.invoices(variables.ownerId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.statement(variables.ownerId),
      });
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.invoiceId] });
      toast.success("Discount removed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove discount");
    },
  });
}
