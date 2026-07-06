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
import type { OwnerBalanceSnapshot } from "@/lib/ownerBalances";

interface ClearOutstandingAfterTopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balances: OwnerBalanceSnapshot;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
}

export function ClearOutstandingAfterTopUpDialog({
  open,
  onOpenChange,
  balances,
  onConfirm,
  pending,
}: ClearOutstandingAfterTopUpDialogProps) {
  if (!balances.canPayAll) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clear outstanding invoices?</DialogTitle>
          <DialogDescription>
            Wallet credit ({formatAed(balances.wallet)}) can cover all open invoices (
            {formatAed(balances.invoiceRemainingTotal)}). Pay them now from the wallet?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Not now
          </Button>
          <Button
            onClick={() => {
              void onConfirm();
            }}
            disabled={pending}
          >
            {pending ? "Processing…" : "Pay all outstanding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
