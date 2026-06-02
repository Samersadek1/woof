import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import { supabase } from "@/integrations/supabase/client";
import { formatAed } from "@/hooks/useBilling";
import { useAccountBalance, accountBalanceQueryKey } from "@/hooks/useAccountBalance";
import { invoiceLedgerQueryKey } from "@/hooks/useInvoiceLedger";
import { calculatePaymentSplit } from "@/lib/accountBalance";
import { payInvoiceFromWallet } from "@/lib/walletInvoicePayment";
import { recordExternalInvoicePayment } from "@/lib/recordExternalInvoicePayment";
import { roundAed } from "@/lib/money";
import { WALLET_TOPUP_PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethod";
import type { ExternalPaymentMethod } from "@/lib/paymentMethod";

export interface PaymentSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  ownerId: string;
  invoiceTotal: number;
  /** Flip a draft invoice to `outstanding` before recording payment. */
  ensureOutstanding?: boolean;
  defaultStaffName?: string;
  title?: string;
  onSuccess?: () => void;
}

/**
 * Wallet-first payment confirmation. Auto-applies available account credit, then
 * collects the remainder by card/cash. Both legs route through the existing
 * payment helpers, which dual-write to `invoice_payments`; the DB trigger then
 * transitions invoice status (outstanding → partially_paid → finalised).
 */
export function PaymentSplitDialog({
  open,
  onOpenChange,
  invoiceId,
  ownerId,
  invoiceTotal,
  ensureOutstanding,
  defaultStaffName,
  title = "Confirm payment",
  onSuccess,
}: PaymentSplitDialogProps) {
  const queryClient = useQueryClient();
  const { data: account, isLoading: accountLoading } = useAccountBalance(
    open ? ownerId : undefined,
  );
  const accountBalance = account?.accountBalance ?? 0;

  const split = useMemo(
    () => calculatePaymentSplit(accountBalance, invoiceTotal),
    [accountBalance, invoiceTotal],
  );

  const [cardAmount, setCardAmount] = useState("");
  const [method, setMethod] = useState<ExternalPaymentMethod>("card");
  const [staffName, setStaffName] = useState(defaultStaffName ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Seed the editable card amount from the auto-calculated split when the dialog
  // opens or the computed split changes.
  useEffect(() => {
    if (open) setCardAmount(split.fromCard > 0 ? String(split.fromCard) : "0");
  }, [open, split.fromCard]);

  const cardNum = Math.max(0, roundAed(parseFloat(cardAmount) || 0));
  const walletApplied = Math.max(0, roundAed(invoiceTotal - cardNum));

  const handleConfirm = async () => {
    if (!staffName.trim()) {
      toast.error("Enter staff name");
      return;
    }
    setSubmitting(true);
    try {
      if (ensureOutstanding) {
        const { error: statusErr } = await supabase
          .from("invoices")
          .update({ status: "outstanding" })
          .eq("id", invoiceId)
          .eq("status", "draft");
        if (statusErr) throw new Error(statusErr.message);
      }

      if (walletApplied > 0) {
        const res = await payInvoiceFromWallet(supabase, {
          invoiceId,
          performedBy: staffName.trim(),
        });
        if (!res.success) throw new Error(res.error || "Wallet payment failed");
      }

      if (cardNum > 0) {
        const res = await recordExternalInvoicePayment(supabase, {
          invoiceId,
          method,
          performedBy: staffName.trim(),
          amountAed: cardNum,
        });
        if (!res.success) throw new Error(res.error || "Card payment failed");
      }

      await queryClient.invalidateQueries({ queryKey: invoiceLedgerQueryKey(invoiceId) });
      await queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey(ownerId) });
      await queryClient.invalidateQueries({ queryKey: ["invoice-alerts"] });
      toast.success("Payment recorded");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : undefined)}>
      <DialogContent className="sm:max-w-md" data-testid="payment-split-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Wallet credit is applied first; collect any remainder by card or cash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice total</span>
            <span className="tabular-nums font-medium">{formatAed(invoiceTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account balance</span>
            <span
              className={`tabular-nums font-medium ${
                accountBalance >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {accountLoading ? "…" : `${accountBalance >= 0 ? "+" : ""}${formatAed(accountBalance)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wallet applied</span>
            <span className="tabular-nums font-medium text-emerald-700">
              {formatAed(walletApplied)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="split-card-amount">Remaining by card/cash (AED)</Label>
            <Input
              id="split-card-amount"
              type="number"
              min="0"
              step="0.01"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
              data-testid="payment-split-card-amount"
            />
          </div>

          {cardNum > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="split-method">Payment method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as ExternalPaymentMethod)}
              >
                <SelectTrigger id="split-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WALLET_TOPUP_PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="payment_link">Payment Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Staff name</Label>
            <StaffNameSelect value={staffName} onChange={setStaffName} />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || accountLoading}
            data-testid="payment-split-confirm"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
