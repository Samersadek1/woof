import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { validateGroomingScheduleTime } from "@/lib/groomingCalendarModel";

export type BlockStationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  blockDate: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  isPending?: boolean;
  onSubmit: (input: {
    isFullDay: boolean;
    startTime: string;
    endTime: string;
    reason: string;
  }) => void;
};

export function BlockStationDialog({
  open,
  onOpenChange,
  stationName,
  blockDate,
  defaultStartTime = "09:00",
  defaultEndTime = "17:00",
  isPending,
  onSubmit,
}: BlockStationDialogProps) {
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setIsFullDay(true);
    setStartTime(defaultStartTime);
    setEndTime(defaultEndTime);
    setReason("");
  }, [open, defaultStartTime, defaultEndTime]);

  const handleSubmit = () => {
    if (!reason.trim()) return;
    if (!isFullDay) {
      const startErr = validateGroomingScheduleTime(startTime, 30);
      const endErr = validateGroomingScheduleTime(endTime, 30);
      if (startErr || endErr) return;
      if (startTime >= endTime) return;
    }
    onSubmit({
      isFullDay,
      startTime,
      endTime,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Block station</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {stationName} · {blockDate}
          </p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="grooming-block-full-day">Full day (7 AM – 7 PM)</Label>
            <Switch
              id="grooming-block-full-day"
              checked={isFullDay}
              onCheckedChange={setIsFullDay}
            />
          </div>
          {!isFullDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Equipment maintenance"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!reason.trim() || isPending}
            onClick={handleSubmit}
          >
            Block station
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
