import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
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

  const [creating, setCreating] = useState(false);

  const createInvoice = async () => {
    setCreating(true);
    try {
      const result = await syncBoardingBookingInvoice(bookingId);
      await queryClient.invalidateQueries({ queryKey: ["invoice", "byBooking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["boarding", "missing-invoices"] });
      const msg = formatSyncBoardingInvoiceToast(result);
      if (result.kind === "skipped") {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invoice");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }

  if (invoice) {
    const total = invoice.total ?? 0;
    return (
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
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      data-testid="boarding-create-invoice-btn"
      disabled={creating}
      onClick={() => void createInvoice()}
    >
      {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
      Create draft invoice
      {bookingRef ? (
        <span className="sr-only"> for {bookingRef}</span>
      ) : null}
    </Button>
  );
}
