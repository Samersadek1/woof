import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type InvoicePricingRow = {
  key: Database["public"]["Enums"]["service_code"];
  label: string;
  amount_aed: number;
};

async function fetchInvoicePricingRows(): Promise<InvoicePricingRow[]> {
  const { data, error } = await supabase
    .from("service_rates")
    .select("service_code, amount_aed, service_code_meta!inner(display_name)")
    .is("pet_size", null)
    .is("coat_type", null)
    .is("season", null)
    .eq("is_active", true)
    .order("service_code");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.service_code,
    label: r.service_code_meta?.display_name ?? r.service_code,
    amount_aed: r.amount_aed,
  }));
}

/** Flat service_rates list for invoice line-item dropdowns (Create Invoice + Add Line Item). */
export function useInvoicePricingRows(enabled = true) {
  return useQuery({
    queryKey: ["invoice-pricing-rows"],
    queryFn: fetchInvoicePricingRows,
    enabled,
    staleTime: 60_000,
  });
}

export { fetchInvoicePricingRows };
