import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  formatSyncBoardingInvoiceToast,
  syncBoardingBookingInvoice,
} from "@/lib/boardingInvoiceSync";
import { formatAed } from "@/lib/money";

type Props = {
  bookingId: string;
  bookingRef?: string | null;
};

export function BoardingBookingInvoiceLink({ bookingId, bookingRef }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", "byBooking", bookingId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, status, total")
        .eq("booking_id", bookingId)
        .neq("status", "voided")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [syncing, setSyncing] = useState(false);

  const runInvoiceSync = async (successPrefix?: string) => {
    setSyncing(true);
    try {
      const result = await syncBoardingBookingInvoice(bookingId);
      await queryClient.invalidateQueries({ queryKey: ["invoice", "byBooking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["boarding", "missing-invoices"] });
      const detail = formatSyncBoardingInvoiceToast(result);
      const msg = successPrefix ? `${successPrefix} ${detail}` : detail;
      if (result.kind === "skipped") {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
    } catch (err) {
      const fallback = successPrefix ? "Could not refresh invoice" : "Could not create invoice";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }

  if (invoice) {
    const total = invoice.total ?? 0;
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          data-testid="boarding-view-invoice-btn"
          onClick={() => navigate(`/billing/invoices/${invoice.id}`)}
        >
          <FileText className="mr-2 h-4 w-4" />
          View invoice ({formatAed(total)})
          <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-60" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          data-testid="boarding-refresh-invoice-btn"
          disabled={syncing}
          onClick={() => void runInvoiceSync("Invoice refreshed.")}
        >
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh invoice
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      data-testid="boarding-create-invoice-btn"
      disabled={syncing}
      onClick={() => void runInvoiceSync()}
    >
      {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
      Create draft invoice
      {bookingRef ? (
        <span className="sr-only"> for {bookingRef}</span>
      ) : null}
    </Button>
  );
}
