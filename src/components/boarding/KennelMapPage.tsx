import { useMemo, useState } from "react";
import { addDays, format, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BoardingAssignmentOverrideDialog } from "@/components/boarding/BoardingAssignmentOverrideDialog";
import { UnassignedQueue } from "@/components/boarding/UnassignedQueue";
import { ZoneGrid } from "@/components/boarding/ZoneGrid";
import {
  assignmentEndFromCheckOut,
  BoardingAssignNeedsOverrideError,
  useAssignBoardingRoom,
  useBoardingNightCapacity,
  useEligibleRooms,
  useKennelMap,
  useUnassignedQueue,
  type UnassignedBoardingRow,
} from "@/hooks/useBoardingCapacity";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  initialDate?: string;
  staffLabel?: string;
};

export function KennelMapPage({ initialDate, staffLabel = "staff" }: Props) {
  const [date, setDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [selected, setSelected] = useState<UnassignedBoardingRow | null>(null);
  const [placedSession, setPlacedSession] = useState(0);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideWarnings, setOverrideWarnings] = useState<{ code: string; msg: string }[]>([]);
  const [pendingAssign, setPendingAssign] = useState<{
    bookingId: string;
    roomId: string;
    start: string;
    end: string;
  } | null>(null);

  const { data: mapData, isLoading: mapLoading } = useKennelMap(date);
  const { data: capacity, isLoading: capLoading } = useBoardingNightCapacity(date);
  const { data: queue = [], isLoading: queueLoading } = useUnassignedQueue(date);
  const assignRoom = useAssignBoardingRoom();

  const eligible = useEligibleRooms(
    selected?.check_in_date,
    selected?.check_out_date,
    selected?.required_class,
  );

  const runAssign = async (
    booking: UnassignedBoardingRow,
    roomId: string,
    overrideReason?: string,
  ) => {
    const end = assignmentEndFromCheckOut(booking.check_out_date);
    const start = booking.check_in_date;
    try {
      await assignRoom.mutateAsync({
        bookingId: booking.booking_id,
        roomId,
        start,
        end,
        staff: staffLabel,
        overrideReason,
      });
      toast.success("Kennel assigned");
      setPlacedSession((n) => n + 1);
      setSelected(null);
      setOverrideOpen(false);
      setPendingAssign(null);
    } catch (err) {
      if (err instanceof BoardingAssignNeedsOverrideError) {
        setPendingAssign({ bookingId: booking.booking_id, roomId, start, end });
        setOverrideWarnings(err.warnings);
        setOverrideOpen(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not assign");
    }
  };

  const handleRoomClick = (
    roomId: string,
    opts: { isEligible: boolean; isOverflow: boolean },
  ) => {
    if (!selected) return;
    if (opts.isEligible) {
      void runAssign(selected, roomId);
      return;
    }
    void runAssign(selected, roomId);
  };

  const capPill = useMemo(() => {
    if (!capacity) return null;
    const u = capacity.unassigned;
    if (capacity.feasible) {
      return {
        tone: "success" as const,
        text: `All ${u} fit tonight`,
        sub: `${capacity.large_free} large · ${capacity.total_free} total free`,
      };
    }
    return {
      tone: "warning" as const,
      text: capacity.reason,
      sub: `${capacity.large_free} large · ${capacity.total_free} total free · ${u} unassigned`,
    };
  }, [capacity]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="boarding-kennel-map-page">
      <header className="shrink-0 flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setDate(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          className="rounded-md border px-2 py-1 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="boarding-kennel-map-date"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {capLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : capPill ? (
          <div
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              capPill.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-amber-400 bg-amber-50 text-amber-950",
            )}
            data-testid="boarding-kennel-capacity-pill"
          >
            <span className="font-medium">{capPill.text}</span>
            <span className="ml-2 text-xs opacity-80">{capPill.sub}</span>
            {capPill.tone === "warning" && (
              <TriangleAlert className="ml-1 inline h-3.5 w-3.5 align-text-bottom" />
            )}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="boarding-kennel-map-print-btn"
            onClick={() =>
              window.open(`/print/kennel-map?date=${date}`, "_blank", "noopener,noreferrer")
            }
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>

          <span className="text-xs text-muted-foreground tabular-nums">
            Placed this session · {placedSession}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <UnassignedQueue
          rows={queue}
          isLoading={queueLoading}
          selectedBookingId={selected?.booking_id ?? null}
          onSelect={(row) => setSelected((cur) => (cur?.booking_id === row.booking_id ? null : row))}
        />
        <ZoneGrid
          rooms={mapData?.rooms ?? []}
          occ={mapData?.occ ?? []}
          eligible={eligible.data ?? []}
          selectedRequiredClass={selected?.required_class ?? null}
          isLoading={mapLoading || eligible.isLoading}
          onRoomClick={handleRoomClick}
        />
      </div>

      <BoardingAssignmentOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        warnings={overrideWarnings}
        isPending={assignRoom.isPending}
        onConfirm={(reason) => {
          if (!selected || !pendingAssign) return;
          void runAssign(selected, pendingAssign.roomId, reason);
        }}
      />
    </div>
  );
}
