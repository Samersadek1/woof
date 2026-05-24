import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, TriangleAlert } from "lucide-react";
import type { BookingWithDetails } from "@/hooks/useBookings";
import { useMoveBoardingRoom } from "@/hooks/useMoveBoardingRoom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatBoardingRoomPickerLabel } from "@/lib/boardingRoomSections";
import { getBookingRoomOverlapErrorMessage } from "@/lib/bookingAvailabilityErrors";
import { roomLabelForBooking, type BookingRoomAssignmentSlice } from "@/lib/bookingRoomDisplay";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

type ChangeRoomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails;
  assignmentSlices: BookingRoomAssignmentSlice[];
  facilityRooms: Room[];
  defaultEffectiveDate?: string;
  onMoved?: () => void;
};

function lastNight(checkOut: string): string {
  const d = parseISO(checkOut);
  d.setDate(d.getDate() - 1);
  return format(d, "yyyy-MM-dd");
}

export function ChangeRoomDialog({
  open,
  onOpenChange,
  booking,
  assignmentSlices,
  facilityRooms,
  defaultEffectiveDate,
  onMoved,
}: ChangeRoomDialogProps) {
  const moveRoom = useMoveBoardingRoom();
  const stayLastNight = lastNight(booking.check_out_date);
  const initialDate =
    defaultEffectiveDate && defaultEffectiveDate >= booking.check_in_date && defaultEffectiveDate <= stayLastNight
      ? defaultEffectiveDate
      : booking.check_in_date;

  const [effectiveDate, setEffectiveDate] = useState(initialDate);
  const [targetRoomId, setTargetRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [movedBy, setMovedBy] = useState("");
  const [confirmDoNotMove, setConfirmDoNotMove] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEffectiveDate(initialDate);
    setTargetRoomId("");
    setReason("");
    setConfirmDoNotMove(false);
  }, [open, initialDate]);

  const currentLabel = useMemo(
    () => roomLabelForBooking(booking, assignmentSlices, { asOfDate: effectiveDate }),
    [booking, assignmentSlices, effectiveDate],
  );

  const sortedRooms = useMemo(
    () => [...facilityRooms].sort((a, b) => formatBoardingRoomPickerLabel(a).localeCompare(formatBoardingRoomPickerLabel(b))),
    [facilityRooms],
  );

  const submitMove = (overrideDoNotMove: boolean) => {
    if (!targetRoomId) {
      toast.error("Choose a target room");
      return;
    }
    moveRoom.mutate(
      {
        bookingId: booking.id,
        effectiveDate,
        targetRoomId,
        reason,
        movedBy,
        overrideDoNotMove,
      },
      {
        onSuccess: () => {
          toast.success("Room updated");
          onOpenChange(false);
          onMoved?.();
        },
        onError: (err) => {
          const overlap = getBookingRoomOverlapErrorMessage(err);
          if (overlap) {
            toast.error(overlap);
            return;
          }
          const msg = err instanceof Error ? err.message : "Room move failed";
          if (msg.includes("DO_NOT_MOVE") && !overrideDoNotMove) {
            setConfirmDoNotMove(true);
            return;
          }
          toast.error(msg);
        },
      },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="boarding-change-room-dialog">
          <DialogHeader>
            <DialogTitle>Change room</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {booking.booking_ref ?? booking.id.slice(0, 8)} · currently {currentLabel} on{" "}
              {format(parseISO(effectiveDate), "d MMM yyyy")}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {booking.do_not_move && (
              <div className="flex gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This booking is flagged DO NOT MOVE. Override requires explicit confirmation.</span>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="change-room-effective">Effective from (night)</Label>
              <Input
                id="change-room-effective"
                type="date"
                data-testid="boarding-change-room-effective-date"
                min={booking.check_in_date}
                max={stayLastNight}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Target room</Label>
              <Select value={targetRoomId} onValueChange={setTargetRoomId}>
                <SelectTrigger data-testid="boarding-change-room-target">
                  <SelectValue placeholder="Select room…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {sortedRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {formatBoardingRoomPickerLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="change-room-reason">Reason</Label>
              <Textarea
                id="change-room-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional — recorded on the booking"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="change-room-by">Moved by</Label>
              <Input
                id="change-room-by"
                value={movedBy}
                onChange={(e) => setMovedBy(e.target.value)}
                placeholder="Staff name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="boarding-change-room-submit"
              disabled={moveRoom.isPending}
              onClick={() => submitMove(false)}
            >
              {moveRoom.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Move room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDoNotMove} onOpenChange={setConfirmDoNotMove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override DO NOT MOVE?</AlertDialogTitle>
            <AlertDialogDescription>
              This booking is flagged do not move. Confirm only if ops explicitly approved the room change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="boarding-change-room-dnm-confirm"
              onClick={() => {
                setConfirmDoNotMove(false);
                submitMove(true);
              }}
            >
              Move anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
