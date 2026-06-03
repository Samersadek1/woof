import { useEffect, useState } from "react";
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
import { accountBalanceQueryKey, useAccountBalance } from "@/hooks/useAccountBalance";
import { clientPaymentSummaryQueryKey } from "@/hooks/useClientPaymentSummary";
import { formatAed, roundAed } from "@/lib/money";
import { WALLET_TOPUP_PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethod";
import type { ExternalPaymentMethod } from "@/lib/paymentMethod";

export interface AccountPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  totalDue: number;
  ownerName: string;
  defaultStaffName?: string;
  onSuccess?: () => void;
}

interface CollectAccountPaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  wallet_amount: number;
  external_amount: number;
}

interface CollectAccountPaymentResult {
  total_collected: number;
  wallet_applied: number;
  external_applied: number;
  invoices_affected: number;
  allocations: CollectAccountPaymentAllocation[];
}

function seedSplit(walletBalance: number, totalDue: number) {
  const walletSeed = roundAed(Math.min(Math.max(walletBalance, 0), totalDue));
  const cardSeed = roundAed(Math.max(0, totalDue - walletSeed));
  return { walletSeed, cardSeed };
}

/**
 * Account-level wallet + external collection via `collect_account_payment` RPC.
 * Wallet is applied oldest-invoice-first inside the RPC; staff enter amounts here.
 */
export function AccountPaymentDialog({
  open,
  onOpenChange,
  ownerId,
  totalDue,
  ownerName,
  defaultStaffName,
  onSuccess,
}: AccountPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { data: account, isLoading: accountLoading } = useAccountBalance(
    open ? ownerId : undefined,
  );
  const walletBalance = account?.walletBalance ?? 0;

  const [walletAmount, setWalletAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [method, setMethod] = useState<ExternalPaymentMethod>("card");
  const [staffName, setStaffName] = useState(defaultStaffName ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const { walletSeed, cardSeed } = seedSplit(walletBalance, totalDue);
    setWalletAmount(String(walletSeed));
    setCardAmount(String(cardSeed));
    setStaffName(defaultStaffName ?? "");
    setMethod("card");
  }, [open, walletBalance, totalDue, defaultStaffName]);

  const walletNum = Math.max(0, roundAed(parseFloat(walletAmount) || 0));
  const cardNum = Math.max(0, roundAed(parseFloat(cardAmount) || 0));
  const totalCollecting = roundAed(walletNum + cardNum);
  const remainingAfter = roundAed(totalDue - totalCollecting);

  const handleConfirm = async () => {
    const trimmedStaff = staffName.trim();
    if (!trimmedStaff) {
      toast.error("Enter staff name");
      return;
    }
    if (walletNum > walletBalance) {
      toast.error(`Wallet amount exceeds available balance (${formatAed(walletBalance)})`);
      return;
    }
    if (totalCollecting === 0) {
      toast.error("Enter a payment amount");
      return;
    }
    if (totalCollecting > totalDue) {
      toast.error(`Total cannot exceed amount due (${formatAed(totalDue)})`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("collect_account_payment", {
        p_owner_id: ownerId,
        p_wallet_amount: walletNum,
        p_external_amount: cardNum,
        p_external_method: cardNum > 0 ? method : null,
        p_performed_by: trimmedStaff,
      });
      if (error) throw error;

      const result = data as unknown as CollectAccountPaymentResult;
      const invoiceCount = result.invoices_affected ?? 0;
      const summary = `Collected ${formatAed(result.total_collected ?? totalCollecting)} across ${invoiceCount} invoice${invoiceCount !== 1 ? "s" : ""}`;
      const breakdown = (result.allocations ?? [])
        .map((row) => {
          const applied = roundAed((row.wallet_amount ?? 0) + (row.external_amount ?? 0));
          if (applied <= 0) return null;
          const label = row.invoice_number ?? row.invoice_id.slice(0, 8);
          return `${label}: ${formatAed(applied)}`;
        })
        .filter(Boolean)
        .join(" · ");

      toast.success(summary, breakdown ? { description: breakdown } : undefined);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientPaymentSummaryQueryKey(ownerId) }),
        queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey(ownerId) }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["statement"] }),
        queryClient.invalidateQueries({ queryKey: ["owners"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] }),
      ]);

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
      <DialogContent className="sm:max-w-md" data-testid="account-payment-dialog">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>
            Apply wallet credit first across {ownerName}&apos;s outstanding invoices, then collect
            the remainder by card or cash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount due</span>
            <span className="tabular-nums font-medium">{formatAed(totalDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wallet balance</span>
            <span className="tabular-nums font-medium text-emerald-700">
              {accountLoading ? "…" : formatAed(walletBalance)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-wallet-amount">From wallet (AED)</Label>
            <Input
              id="account-wallet-amount"
              type="number"
              min="0"
              step="0.001"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              data-testid="account-payment-wallet-amount"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-card-amount">By card/cash (AED)</Label>
            <Input
              id="account-card-amount"
              type="number"
              min="0"
              step="0.001"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
              data-testid="account-payment-card-amount"
            />
          </div>

          {cardNum > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="account-payment-method">Payment method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as ExternalPaymentMethod)}
              >
                <SelectTrigger id="account-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WALLET_TOPUP_PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Collecting total</span>
              <span className="tabular-nums font-medium">{formatAed(totalCollecting)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining after</span>
              <span
                className={`tabular-nums font-medium ${
                  remainingAfter < 0 ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {formatAed(remainingAfter)}
              </span>
            </div>
          </div>

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
            onClick={() => void handleConfirm()}
            disabled={submitting || accountLoading}
            data-testid="account-payment-confirm"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
