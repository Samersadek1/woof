import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useBoardingBookingsWithInvoiceCount,
  useRepriceBoardingInvoices,
} from "@/hooks/useRepriceBoardingInvoices";

export function RepriceBoardingInvoicesButton() {
  const { data: invoiceCount = 0, isLoading: countLoading } =
    useBoardingBookingsWithInvoiceCount();
  const reprice = useRepriceBoardingInvoices();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const running = reprice.isPending;

  const runReprice = () => {
    setProgress({ done: 0, total: invoiceCount });
    reprice.mutate(
      (done, total) => setProgress({ done, total }),
      {
        onSuccess: (result) => {
          setOpen(false);
          setProgress(null);
          if (result.failed > 0) {
            toast.warning(
              `Repriced ${result.updated} invoice${result.updated !== 1 ? "s" : ""}; ${result.failed} failed.`,
            );
            return;
          }
          toast.success(
            `Repriced ${result.updated} boarding invoice${result.updated !== 1 ? "s" : ""} using current peak/off-peak dates.`,
          );
        },
        onError: (err) => {
          setProgress(null);
          toast.error(err instanceof Error ? err.message : "Reprice failed");
        },
      },
    );
  };

  if (!countLoading && invoiceCount === 0) {
    return null;
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!running) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="boarding-reprice-invoices-btn"
          disabled={countLoading || invoiceCount === 0}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {countLoading ? "Checking invoices…" : `Reprice ${invoiceCount} invoices`}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reprice boarding invoices?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This recalculates <strong className="text-foreground">boarding night lines</strong> on{" "}
                {invoiceCount} existing invoice{invoiceCount !== 1 ? "s" : ""} using the current peak
                calendar and boarding rates. Transport, grooming add-ons, and other non-night lines are
                left unchanged.
              </p>
              <p>
                Amounts already paid are preserved. If the new total is higher, the invoice may show an
                outstanding balance; if lower, it stays paid or partial as appropriate.
              </p>
              {running && progress ? (
                <div className="space-y-1 pt-2">
                  <p className="text-foreground">
                    Processing {progress.done} of {progress.total}…
                  </p>
                  <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={running || invoiceCount === 0}
            onClick={(e) => {
              e.preventDefault();
              runReprice();
            }}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Repricing…
              </>
            ) : (
              "Reprice all"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
