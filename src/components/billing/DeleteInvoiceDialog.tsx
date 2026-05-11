import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useDeleteInvoice } from "@/hooks/useDeleteInvoice";
import { toast } from "sonner";

interface DeleteInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceUuid: string;
  invoiceNumberDisplay: string;
  ownerName: string;
  totalAmount: number;
  onDeleted?: () => void;
}

export function DeleteInvoiceDialog({
  open,
  onOpenChange,
  invoiceUuid,
  invoiceNumberDisplay,
  ownerName,
  totalAmount,
  onDeleted,
}: DeleteInvoiceDialogProps) {
  const { user } = useAuth();
  const deleteInvoice = useDeleteInvoice();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleDelete = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Reason for deletion is required.");
      return;
    }
    const email = user?.email?.trim();
    if (!email) {
      toast.error("Could not determine your account email.");
      return;
    }
    try {
      await deleteInvoice.mutateAsync({
        invoiceUuid,
        invoiceNumberDisplay,
        ownerName,
        totalAmount,
        reason: trimmed,
        deletedByEmail: email,
      });
      toast.success("Invoice deleted.");
      onOpenChange(false);
      onDeleted?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not delete invoice.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Invoice</DialogTitle>
          <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invoice-delete-reason">Reason for deletion</Label>
          <Textarea
            id="invoice-delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteInvoice.isPending || !reason.trim()}
          >
            {deleteInvoice.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
