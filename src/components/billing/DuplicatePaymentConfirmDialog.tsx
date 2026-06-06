import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatAed } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import type { DuplicatePaymentInfo } from "@/lib/recordExternalInvoicePayment";

interface DuplicatePaymentConfirmDialogProps {
  open: boolean;
  duplicate: DuplicatePaymentInfo | null;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Alert-only guard: a same-amount payment was recorded on this invoice within
 * the last few minutes. Staff must explicitly confirm before recording again.
 */
export function DuplicatePaymentConfirmDialog({
  open,
  duplicate,
  submitting,
  onConfirm,
  onCancel,
}: DuplicatePaymentConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onCancel() : undefined)}>
      <DialogContent data-testid="duplicate-payment-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Possible duplicate payment
          </DialogTitle>
          <DialogDescription>
            A matching payment was already recorded on this invoice moments ago. Only
            continue if the client genuinely paid more than once.
          </DialogDescription>
        </DialogHeader>

        {duplicate ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
            <p className="font-medium">
              {formatAed(duplicate.amount)} · {paymentMethodLabel(duplicate.method)}
            </p>
            <p className="text-xs">
              Recorded {format(new Date(duplicate.createdAt), "d MMM yyyy, HH:mm")}
              {duplicate.recordedBy ? ` by ${duplicate.recordedBy}` : ""}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            data-testid="duplicate-payment-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
            data-testid="duplicate-payment-confirm"
          >
            {submitting ? "Recording…" : "Record anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
