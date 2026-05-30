import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BoardingValidationWarning } from "@/lib/boardingCapacity";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: BoardingValidationWarning[];
  isPending?: boolean;
  onConfirm: (reason: string) => void;
};

export function BoardingAssignmentOverrideDialog({
  open,
  onOpenChange,
  warnings,
  isPending,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="boarding-override-dialog">
        <DialogHeader>
          <DialogTitle>Assignment warning</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This assignment has capacity or room-fit warnings. Provide a reason to override and
            save anyway.
          </p>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {warnings.map((w) => (
            <li key={w.code}>{w.msg}</li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="boarding-override-reason">Override reason</Label>
          <Textarea
            id="boarding-override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this assignment acceptable?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="boarding-override-confirm-btn"
            disabled={!reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            Override and assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
