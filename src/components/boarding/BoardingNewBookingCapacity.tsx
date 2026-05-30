import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  computeRequiredRoomClass,
  formatRequiredClassBanner,
  requiredClassLabel,
  type RoomSizeClass,
} from "@/lib/boardingCapacity";
import {
  useEligibleRooms,
  useRangeFeasibility,
  type SuggestedBoardingRoom,
} from "@/hooks/useBoardingCapacity";
import { cn } from "@/lib/utils";

type PetSizeInput = {
  id: string;
  size?: string | null;
  room_restriction?: string | null;
};

type Props = {
  checkIn?: string;
  checkOut?: string;
  pets: PetSizeInput[];
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
  showAllRooms: boolean;
  onShowAllRoomsChange: (open: boolean) => void;
};

export function BoardingNewBookingCapacity({
  checkIn,
  checkOut,
  pets,
  selectedRoomId,
  onSelectRoom,
  showAllRooms,
  onShowAllRoomsChange,
}: Props) {
  const forceLarge = pets.some((p) => p.room_restriction === "large_only");
  const sizes = pets.map((p) => p.size);
  const requiredClass = useMemo(
    () => computeRequiredRoomClass(sizes, forceLarge),
    [sizes, forceLarge],
  );

  const range = useRangeFeasibility(checkIn, checkOut, requiredClass);
  const eligible = useEligibleRooms(checkIn, checkOut, requiredClass);

  const tightest = useMemo(() => {
    const rows = range.data ?? [];
    if (rows.length === 0) return null;
    return rows.reduce((worst, row) =>
      row.total_free < worst.total_free ? row : worst,
    );
  }, [range.data]);

  const suggested = eligible.data?.[0];
  const overflowRooms = (eligible.data ?? []).filter((r) => r.is_overflow);
  const standardRooms = (eligible.data ?? []).filter((r) => !r.is_overflow);

  const displayRooms: SuggestedBoardingRoom[] = showAllRooms
    ? (eligible.data ?? [])
    : suggested
      ? [suggested, ...overflowRooms.slice(0, 4)]
      : [];

  return (
    <div className="space-y-3" data-testid="boarding-new-capacity-panel">
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-sm",
          forceLarge ? "border-amber-300 bg-amber-50" : "border-muted bg-muted/30",
        )}
      >
        <span className="font-medium">{formatRequiredClassBanner(requiredClass, {
          hasRestriction: forceLarge,
          petCount: pets.length,
          sizes: sizes.filter(Boolean) as string[],
        })}</span>
      </div>

      {checkIn && checkOut && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stay capacity (per night)
          </p>
          {range.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {(range.data ?? []).map((row) => (
                  <div
                    key={row.stay_date}
                    title={row.reason}
                    className={cn(
                      "rounded border px-2 py-1 text-[10px] tabular-nums",
                      row.feasible
                        ? "border-border bg-card"
                        : "border-amber-400 bg-amber-50 text-amber-950",
                    )}
                  >
                    <div>{format(parseISO(row.stay_date), "d MMM")}</div>
                    <div>L {row.large_free} · T {row.total_free}</div>
                  </div>
                ))}
              </div>
              {tightest && !tightest.feasible && (
                <p className="flex items-center gap-1 text-xs text-amber-800">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  Tightest night {format(parseISO(tightest.stay_date), "d MMM")}: {tightest.reason}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {checkIn && checkOut && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested room ({requiredClassLabel(requiredClass)})
          </p>
          {eligible.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : displayRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible rooms for these dates.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {displayRooms.map((room, idx) => (
                <Button
                  key={room.room_id}
                  type="button"
                  size="sm"
                  variant={selectedRoomId === room.room_id ? "default" : "outline"}
                  className={cn(idx === 0 && !showAllRooms && "ring-2 ring-primary/40")}
                  data-testid={`boarding-eligible-room-${room.room_id}`}
                  onClick={() => onSelectRoom(room.room_id)}
                >
                  {room.room_label}
                  {room.is_overflow ? (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      overflow
                    </Badge>
                  ) : null}
                </Button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => onShowAllRoomsChange(!showAllRooms)}
          >
            {showAllRooms
              ? "Show suggested only"
              : "Show all rooms (override — needs reason if warnings)"}
          </button>
          {!showAllRooms && standardRooms.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {standardRooms.length} standard + {overflowRooms.length} large overflow available
            </p>
          )}
        </div>
      )}
    </div>
  );
}
