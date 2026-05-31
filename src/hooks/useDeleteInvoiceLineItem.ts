import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { billingKeys } from "@/hooks/useBilling";
import { recalculateInvoiceTotals } from "@/lib/invoiceRecalc";
import { toast } from "sonner";

export interface DeleteInvoiceLineItemInput {
  lineItemId: string;
  invoiceId: string;
  ownerId: string;
}

export function useDeleteInvoiceLineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteInvoiceLineItemInput) => {
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", input.invoiceId)
        .single();
      if (invErr) throw invErr;
      if (invoice.status !== "draft") {
        throw new Error("Line items can only be removed from draft invoices.");
      }

      const { error: delErr } = await supabase
        .from("invoice_line_items")
        .delete()
        .eq("id", input.lineItemId)
        .eq("invoice_id", input.invoiceId);
      if (delErr) throw delErr;

      await recalculateInvoiceTotals(input.invoiceId);
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
      toast.success("Line item removed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove line item");
    },
  });
}
