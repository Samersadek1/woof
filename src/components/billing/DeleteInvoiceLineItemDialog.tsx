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
import { useDeleteInvoiceLineItem } from "@/hooks/useDeleteInvoiceLineItem";

export interface DeleteInvoiceLineItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItem: { id: string; description: string } | null;
  invoiceId: string;
  ownerId: string;
  onDeleted?: () => void;
}

export function DeleteInvoiceLineItemDialog({
  open,
  onOpenChange,
  lineItem,
  invoiceId,
  ownerId,
  onDeleted,
}: DeleteInvoiceLineItemDialogProps) {
  const deleteLine = useDeleteInvoiceLineItem();

  const handleConfirm = () => {
    if (!lineItem) return;
    void deleteLine
      .mutateAsync({
        lineItemId: lineItem.id,
        invoiceId,
        ownerId,
      })
      .then(() => {
        onOpenChange(false);
        onDeleted?.();
      });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="delete-invoice-line-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove line item?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove{" "}
            <span className="font-medium text-foreground">
              {lineItem?.description ?? "this line item"}
            </span>{" "}
            from the draft invoice. Invoice totals will be recalculated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteLine.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteLine.isPending || !lineItem}
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
