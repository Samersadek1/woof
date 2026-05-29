import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatAed } from "@/lib/money";
import { paymentMethodLabel, type ExternalPaymentMethod } from "@/lib/paymentMethod";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
  outstanding?: number;
  externalMethod?: ExternalPaymentMethod | null;
  onUseWallet: () => void;
  onContinueExternal: () => void;
};

export function WalletCreditExternalPaymentDialog({
  open,
  onOpenChange,
  walletBalance,
  outstanding,
  externalMethod,
  onUseWallet,
  onContinueExternal,
}: Props) {
  const methodLabel = externalMethod ? paymentMethodLabel(externalMethod) : "external payment";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="wallet-credit-external-payment-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Wallet credit available</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This owner has <strong className="text-foreground">{formatAed(walletBalance)}</strong> in
                their wallet.
              </p>
              {outstanding != null && outstanding > 0 ? (
                <p>
                  Invoice outstanding: <strong className="text-foreground">{formatAed(outstanding)}</strong>.
                  Consider paying from wallet first.
                </p>
              ) : null}
              <p>
                You are about to record a <strong className="text-foreground">{methodLabel}</strong> instead.
                Continue only if the customer paid outside the wallet on purpose.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type="button" variant="secondary" onClick={onUseWallet}>
            Use wallet
          </Button>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onContinueExternal();
            }}
          >
            Continue with {methodLabel.toLowerCase()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
