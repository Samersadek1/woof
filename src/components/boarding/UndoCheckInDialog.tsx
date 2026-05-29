import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookingWithDetails } from "@/hooks/useBookings";
import { useUndoCheckIn } from "@/hooks/useBookings";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails;
  onUndone: (booking: BookingWithDetails) => void;
};

export function UndoCheckInDialog({ open, onOpenChange, booking, onUndone }: Props) {
  const undoCheckIn = useUndoCheckIn();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undo check-in?</DialogTitle>
          <DialogDescription>
            Reverts this stay to confirmed. The booking, room assignment, and invoice stay as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep checked in
          </Button>
          <Button
            onClick={() =>
              undoCheckIn.mutate(booking.id, {
                onSuccess: () => {
                  toast.success("Check-in undone — booking is confirmed again.");
                  onUndone({ ...booking, status: "confirmed", actual_check_in_at: null });
                  onOpenChange(false);
                },
                onError: (err) => toast.error(err.message),
              })
            }
            disabled={undoCheckIn.isPending}
          >
            {undoCheckIn.isPending ? "Reverting…" : "Undo check-in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
