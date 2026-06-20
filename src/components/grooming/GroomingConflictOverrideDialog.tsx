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
import type { GroomingScheduleConflict } from "@/lib/groomingScheduleUtils";

export type GroomingConflictOverrideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: GroomingScheduleConflict[];
  isPending?: boolean;
  onConfirm: (reason: string) => void;
};

export function GroomingConflictOverrideDialog({
  open,
  onOpenChange,
  conflicts,
  isPending,
  onConfirm,
}: GroomingConflictOverrideDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule conflict</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This appointment overlaps an existing booking or station block. Provide a reason to
            override and save anyway.
          </p>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {conflicts.map((c) => (
            <li key={`${c.conflictType}-${c.conflictedWithId}`}>{c.label}</li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="grooming-override-reason">Override reason</Label>
          <Textarea
            id="grooming-override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this overlap acceptable?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            Override and save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
