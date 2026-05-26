import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { billingKeys } from "@/hooks/useBilling";
import { recalculateInvoiceTotals } from "@/lib/invoiceRecalc";
import { toast } from "sonner";

export interface AddInvoiceLineItemInput {
  invoiceId: string;
  ownerId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  pricingKey?: string | null;
  serviceType?: string | null;
}

export function useAddInvoiceLineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddInvoiceLineItemInput) => {
      const qty = Math.max(1, input.quantity);
      const unitPrice = Math.max(0, input.unitPrice);
      const lineTotal = unitPrice * qty;

      const { data: existing, error: sortErr } = await supabase
        .from("invoice_line_items")
        .select("sort_order")
        .eq("invoice_id", input.invoiceId)
        .order("sort_order", { ascending: false, nullsFirst: false })
        .limit(1);
      if (sortErr) throw sortErr;

      const maxSort = existing?.[0]?.sort_order ?? -1;
      const sortOrder = (maxSort ?? -1) + 1;

      const row: Database["public"]["Tables"]["invoice_line_items"]["Insert"] = {
        invoice_id: input.invoiceId,
        description: input.description.trim(),
        pricing_key: input.pricingKey ?? null,
        quantity: qty,
        unit_price: unitPrice,
        total_price: lineTotal,
        line_total: lineTotal,
        service_type: input.serviceType ?? "other",
        sort_order: sortOrder,
      };

      const { error: insErr } = await supabase.from("invoice_line_items").insert(row);
      if (insErr) throw insErr;

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
      toast.success("Line item added");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add line item");
    },
  });
}
