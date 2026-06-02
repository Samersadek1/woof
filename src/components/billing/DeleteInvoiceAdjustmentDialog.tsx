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
import { useDeleteInvoiceAdjustment } from "@/hooks/useDeleteInvoiceAdjustment";

export interface DeleteInvoiceAdjustmentTarget {
  id: string;
  adjustment_type: string;
  reason: string | null;
}

export interface DeleteInvoiceAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustment: DeleteInvoiceAdjustmentTarget | null;
  invoiceId: string;
  ownerId: string;
  onDeleted?: () => void;
}

export function DeleteInvoiceAdjustmentDialog({
  open,
  onOpenChange,
  adjustment,
  invoiceId,
  ownerId,
  onDeleted,
}: DeleteInvoiceAdjustmentDialogProps) {
  const deleteAdjustment = useDeleteInvoiceAdjustment();

  const handleConfirm = () => {
    if (!adjustment) return;
    void deleteAdjustment
      .mutateAsync({
        adjustmentId: adjustment.id,
        invoiceId,
        ownerId,
      })
      .then(() => {
        onOpenChange(false);
        onDeleted?.();
      });
  };

  const typeLabel = adjustment?.adjustment_type.replace(/_/g, " ") ?? "discount";
  const isSystemDiscount = adjustment?.adjustment_type === "double_occupancy_discount";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="delete-invoice-adjustment-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {typeLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the adjustment
            {adjustment?.reason ? (
              <>
                {" "}
                <span className="font-medium text-foreground">{adjustment.reason}</span>
              </>
            ) : null}{" "}
            and recalculate invoice totals.
            {isSystemDiscount ? (
              <>
                {" "}
                Refreshing the boarding invoice may re-apply the double-occupancy discount.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAdjustment.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteAdjustment.isPending || !adjustment}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
