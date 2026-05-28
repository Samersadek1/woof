import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import type { BookingWithDetails } from "@/hooks/useBookings";
import { useUpdateBooking } from "@/hooks/useBookings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails;
  onCancelled: () => void;
};

export function CancelBookingDialog({ open, onOpenChange, booking, onCancelled }: Props) {
  const updateBooking = useUpdateBooking();
  const [reason, setReason] = useState("");
  const [staffName, setStaffName] = useState("");
  const [voidInvoice, setVoidInvoice] = useState(false);
  const [pending, setPending] = useState(false);

  const isCheckedIn = booking.status === "checked_in";

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.error("Enter a cancellation reason.");
      return;
    }
    if (!staffName.trim()) {
      toast.error("Staff name is required.");
      return;
    }

    setPending(true);
    try {
      const patch: {
        status: "cancelled";
        actual_check_out_at?: string;
        notes?: string;
      } = {
        status: "cancelled",
        notes: [booking.notes, `Cancelled by ${staffName.trim()}: ${reason.trim()}`]
          .filter(Boolean)
          .join("\n"),
      };
      if (isCheckedIn && !booking.actual_check_out_at) {
        patch.actual_check_out_at = new Date().toISOString();
      }

      await updateBooking.mutateAsync({ id: booking.id, ...patch });

      if (voidInvoice) {
        const { data: invoice } = await supabase
          .from("invoices")
          .select("id, status, amount_paid")
          .eq("booking_id", booking.id)
          .neq("status", "voided")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (invoice) {
          if ((invoice.amount_paid ?? 0) > 0) {
            toast.warning(
              "Booking cancelled. Linked invoice has payments — void/refund it from Billing.",
            );
          } else {
            await supabase
              .from("invoices")
              .update({
                status: "voided",
                voided_at: new Date().toISOString(),
                voided_reason: `Booking cancelled by ${staffName.trim()}: ${reason.trim()}`,
              })
              .eq("id", invoice.id);
          }
        }
      }

      toast.success("Booking cancelled.");
      onCancelled();
      onOpenChange(false);
      setReason("");
      setVoidInvoice(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel booking.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
          <DialogDescription>
            {isCheckedIn
              ? "This dog is currently checked in. Cancelling ends the stay and cannot be undone from this screen."
              : "The booking will be marked cancelled. This does not delete invoice history."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this booking being cancelled?"
              rows={3}
              data-testid="boarding-cancel-booking-reason"
            />
          </div>
          <StaffNameSelect value={staffName} onChange={setStaffName} label="Logged by" />
          <div className="flex items-start gap-2">
            <Checkbox
              id="void-invoice"
              checked={voidInvoice}
              onCheckedChange={(v) => setVoidInvoice(v === true)}
            />
            <Label htmlFor="void-invoice" className="font-normal leading-snug">
              Also void linked draft/unpaid invoice (skip if invoice has payments)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
