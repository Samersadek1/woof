import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceDisplayTotals } from "@/lib/vatConfig";

export type StatementRow = {
  invoice_id: string;
  invoice_number: string | null;
  service_type: string | null;
  status: string;
  total: number;
  created_at: string;
  due_date: string | null;
  days_overdue: number;
};

function daysOverdueFor(dueDate: string | null, status: string): number {
  if (!dueDate) return 0;
  if (["paid", "voided", "cancelled"].includes(status)) return 0;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due >= today) return 0;
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

async function loadStatementDirect(ownerId: string): Promise<StatementRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, vat_aed, service_type, notes, created_at, due_date, receipt_only")
    .eq("owner_id", ownerId)
    .or("receipt_only.is.null,receipt_only.eq.false")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    invoice_id: r.id,
    invoice_number: r.invoice_number,
    service_type: r.service_type,
    status: r.status,
    total: invoiceDisplayTotals({
      total: r.total,
      vat_aed: r.vat_aed,
      service_type: r.service_type,
      notes: r.notes,
    }).grandTotal,
    created_at: r.created_at,
    due_date: r.due_date,
    days_overdue: daysOverdueFor(r.due_date, r.status),
  }));
}

export function useStatementOfAccount(ownerId?: string) {
  return useQuery({
    queryKey: ["statement", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_statement_of_account", {
        p_owner_id: ownerId as string,
      });
      // RPC currently fails (invoice_number text vs varchar mismatch) — fall back
      // to a direct query, matching useOwnerStatement in useBilling.ts.
      if (error) {
        return loadStatementDirect(ownerId as string);
      }
      return (data ?? []) as StatementRow[];
    },
  });
}
