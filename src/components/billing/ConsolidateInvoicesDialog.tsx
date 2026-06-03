import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import { useConsolidateInvoices } from "@/hooks/usePayments";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  invoiceIds: string[];
  onSuccess?: () => void;
};

export function ConsolidateInvoicesDialog({
  open,
  onOpenChange,
  ownerId,
  invoiceIds,
  onSuccess,
}: Props) {
  const navigate = useNavigate();
  const consolidate = useConsolidateInvoices();
  const [staffName, setStaffName] = useState("");

  const handleConsolidate = async () => {
    if (!staffName.trim()) {
      toast.error("Staff name is required.");
      return;
    }
    try {
      const newId = await consolidate.mutateAsync({
        ownerId,
        invoiceIds,
        performedBy: staffName.trim(),
      });
      toast.success("Invoices consolidated.");
      onOpenChange(false);
      onSuccess?.();
      navigate(`/billing/invoices/${newId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Consolidation failed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consolidate {invoiceIds.length} invoices</DialogTitle>
          <DialogDescription>
            Creates one new invoice for the combined balance and voids the selected sources.
          </DialogDescription>
        </DialogHeader>
        <StaffNameSelect value={staffName} onChange={setStaffName} label="Processed by" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={consolidate.isPending} onClick={handleConsolidate}>
            {consolidate.isPending ? "Consolidating…" : "Consolidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
