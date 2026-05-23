import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type LineRow = Database["public"]["Tables"]["invoice_line_items"]["Row"];
type AdjustmentRow = Database["public"]["Tables"]["billing_adjustments"]["Row"];
type PaymentRow = Database["public"]["Tables"]["wallet_transactions"]["Row"];

export interface InvoiceDetailAggregate {
  invoice: (InvoiceRow & {
    owners: {
      id: string;
      first_name: string;
      last_name: string | null;
      wallet_balance: number;
    } | null;
  }) | null;
  lines: LineRow[];
  adjustments: AdjustmentRow[];
  payments: PaymentRow[];
}

export function useInvoiceDetail(invoiceId?: string) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoiceDetailAggregate> => {
      const id = invoiceId as string;

      const [invoiceRes, linesRes, adjustmentsRes, paymentsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "*, owners(id, first_name, last_name, wallet_balance)",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", id)
          .order("sort_order", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("billing_adjustments")
          .select("*")
          .eq("invoice_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("wallet_transactions")
          .select("*")
          .eq("invoice_id", id)
          .order("created_at", { ascending: false }),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;
      if (linesRes.error) throw linesRes.error;
      if (adjustmentsRes.error) throw adjustmentsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      return {
        invoice: (invoiceRes.data as unknown as InvoiceDetailAggregate["invoice"]) ?? null,
        lines: (linesRes.data ?? []) as LineRow[],
        adjustments: (adjustmentsRes.data ?? []) as AdjustmentRow[],
        payments: (paymentsRes.data ?? []) as PaymentRow[],
      };
    },
  });
}
