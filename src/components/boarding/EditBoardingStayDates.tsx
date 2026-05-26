import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil } from "lucide-react";
import type { BookingWithDetails } from "@/hooks/useBookings";
import { useUpdateBooking } from "@/hooks/useBookings";
import { calculateNights, validateBoardingDateRange } from "@/lib/bookingUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type EditBoardingStayDatesProps = {
  booking: BookingWithDetails;
  onUpdated: (patch: Pick<BookingWithDetails, "check_in_date" | "check_out_date">) => void;
};

export function canEditBoardingStay(status: string): boolean {
  return status !== "cancelled";
}

export function EditBoardingStayDates({ booking, onUpdated }: EditBoardingStayDatesProps) {
  const queryClient = useQueryClient();
  const updateBooking = useUpdateBooking();
  const editable = canEditBoardingStay(booking.status);

  const [editing, setEditing] = useState(false);
  const [checkIn, setCheckIn] = useState(booking.check_in_date);
  const [checkOut, setCheckOut] = useState(booking.check_out_date);

  useEffect(() => {
    setCheckIn(booking.check_in_date);
    setCheckOut(booking.check_out_date);
    setEditing(false);
  }, [booking.id, booking.check_in_date, booking.check_out_date]);

  const dirty =
    checkIn !== booking.check_in_date || checkOut !== booking.check_out_date;
  const validationError = useMemo(
    () => (editing || dirty ? validateBoardingDateRange(checkIn, checkOut) : null),
    [checkIn, checkOut, editing, dirty],
  );
  const nights = calculateNights(checkIn, checkOut);

  const save = () => {
    const err = validateBoardingDateRange(checkIn, checkOut);
    if (err) {
      toast.error(err);
      return;
    }
    updateBooking.mutate(
      { id: booking.id, check_in_date: checkIn, check_out_date: checkOut },
      {
        onSuccess: () => {
          toast.success("Stay dates updated");
          queryClient.invalidateQueries({ queryKey: ["booking_room_assignments"] });
          onUpdated({ check_in_date: checkIn, check_out_date: checkOut });
          setEditing(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (!editable) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
          <p className="text-sm">{format(parseISO(booking.check_in_date), "d MMM yyyy")}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
          <p className="text-sm">{format(parseISO(booking.check_out_date), "d MMM yyyy")}</p>
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
            <p className="text-sm">{format(parseISO(booking.check_in_date), "d MMM yyyy")}</p>
            {booking.actual_check_in_at && (
              <p className="text-xs text-muted-foreground">
                Actual: {format(parseISO(booking.actual_check_in_at), "d MMM HH:mm")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
            <p className="text-sm">{format(parseISO(booking.check_out_date), "d MMM yyyy")}</p>
            {booking.actual_check_out_at && (
              <p className="text-xs text-muted-foreground">
                Actual: {format(parseISO(booking.actual_check_out_at), "d MMM HH:mm")}
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          data-testid="boarding-edit-stay-dates-btn"
          onClick={() => setEditing(true)}
        >
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit stay dates
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/30">
      <p className="text-xs text-muted-foreground">
        Correct planned stay dates anytime (including after check-in or check-out). Use Change room
        if the kennel row still looks wrong.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="boarding-edit-check-in">Check-in</Label>
          <Input
            id="boarding-edit-check-in"
            type="date"
            data-testid="boarding-edit-checkin-date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="boarding-edit-check-out">Check-out</Label>
          <Input
            id="boarding-edit-check-out"
            type="date"
            data-testid="boarding-edit-checkout-date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>
      {validationError ? (
        <p className="text-xs text-destructive">{validationError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {nights} night{nights !== 1 ? "s" : ""} (check-out day is departure, not charged)
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={updateBooking.isPending}
          onClick={() => {
            setCheckIn(booking.check_in_date);
            setCheckOut(booking.check_out_date);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          data-testid="boarding-save-stay-dates-btn"
          disabled={!dirty || !!validationError || updateBooking.isPending}
          onClick={save}
        >
          {updateBooking.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save dates
        </Button>
      </div>
    </div>
  );
}
