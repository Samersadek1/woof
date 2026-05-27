import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
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
  useBackfillBoardingInvoices,
  useBoardingBookingsMissingInvoiceCount,
} from "@/hooks/useBackfillBoardingInvoices";

export function BackfillBoardingInvoicesButton() {
  const { data: missingCount = 0, isLoading: countLoading } =
    useBoardingBookingsMissingInvoiceCount();
  const backfill = useBackfillBoardingInvoices();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const running = backfill.isPending;

  const runBackfill = () => {
    setProgress({ done: 0, total: missingCount });
    backfill.mutate(
      (done, total) => setProgress({ done, total }),
      {
        onSuccess: (result) => {
          setOpen(false);
          setProgress(null);
          if (result.created === 0 && result.failed === 0 && result.skipped > 0) {
            toast.warning(`No invoices created (${result.skipped} skipped).`);
            return;
          }
          if (result.failed > 0) {
            toast.warning(
              `Created ${result.created} draft invoice${result.created !== 1 ? "s" : ""}; ${result.failed} failed.`,
            );
            return;
          }
          toast.success(
            `Created ${result.created} draft invoice${result.created !== 1 ? "s" : ""} for boarding stays.`,
          );
        },
        onError: (err) => {
          setProgress(null);
          toast.error(err instanceof Error ? err.message : "Backfill failed");
        },
      },
    );
  };

  if (!countLoading && missingCount === 0) {
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
          data-testid="boarding-backfill-invoices-btn"
          disabled={countLoading || missingCount === 0}
        >
          <FileText className="mr-2 h-4 w-4" />
          {countLoading ? "Checking invoices…" : `Create ${missingCount} missing invoices`}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create missing boarding invoices?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This will create a <strong className="text-foreground">draft invoice</strong> for each
                active boarding stay that does not already have one ({missingCount} stay
                {missingCount !== 1 ? "s" : ""}).
              </p>
              <p>
                Night rates use current pricing tables (peak/off-peak) and double-occupancy discount
                rules where applicable. Review totals in Billing before collecting payment.
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
            disabled={running || missingCount === 0}
            onClick={(e) => {
              e.preventDefault();
              runBackfill();
            }}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create draft invoices"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
