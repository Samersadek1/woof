import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  KennelMapOccupancy,
  KennelMapRoom,
  SuggestedBoardingRoom,
} from "@/hooks/useBoardingCapacity";
import type { RoomSizeClass } from "@/lib/boardingCapacity";
import { requiredClassLabel } from "@/lib/boardingCapacity";
import { cn } from "@/lib/utils";

const ZONE_ORDER = ["A", "B", "C", "D", "Grooming", "Daycare", "Overflow"];

type Props = {
  rooms: KennelMapRoom[];
  occ: KennelMapOccupancy[];
  eligible: SuggestedBoardingRoom[];
  selectedRequiredClass: RoomSizeClass | null;
  isLoading?: boolean;
  onRoomClick: (roomId: string, opts: { isEligible: boolean; isOverflow: boolean }) => void;
};

function roomLabel(room: KennelMapRoom): string {
  return room.display_name?.trim() || room.name?.trim() || room.room_number;
}

function occupantLabel(row: KennelMapOccupancy): string {
  const ref = row.bookings?.booking_ref;
  const pets =
    row.bookings?.booking_pets
      ?.map((bp) => bp.pets?.name)
      .filter(Boolean)
      .join(", ") ?? "";
  return pets || ref || "Occupied";
}

export function ZoneGrid({
  rooms,
  occ,
  eligible,
  selectedRequiredClass,
  isLoading,
  onRoomClick,
}: Props) {
  const occByRoom = useMemo(() => {
    const m = new Map<string, KennelMapOccupancy>();
    for (const row of occ) {
      if (row.room_id) m.set(row.room_id, row);
    }
    return m;
  }, [occ]);

  const eligibleByRoom = useMemo(() => {
    const m = new Map<string, SuggestedBoardingRoom>();
    for (const r of eligible) m.set(r.room_id, r);
    return m;
  }, [eligible]);

  const zones = useMemo(() => {
    const map = new Map<string, KennelMapRoom[]>();
    for (const room of rooms) {
      const z = room.zone ?? "Other";
      if (!map.has(z)) map.set(z, []);
      map.get(z)!.push(room);
    }
    for (const list of map.values()) {
      list.sort((a, b) => roomLabel(a).localeCompare(roomLabel(b), undefined, { numeric: true }));
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ia = ZONE_ORDER.indexOf(a);
      const ib = ZONE_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    return keys.map((zone) => ({
      zone,
      rooms: map.get(zone)!,
      sizeClass: map.get(zone)![0]?.size_class ?? "standard",
    }));
  }, [rooms]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="boarding-zone-grid">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto p-4" data-testid="boarding-zone-grid">
      {!selectedRequiredClass && (
        <p className="text-sm text-muted-foreground">
          Select an unassigned dog to see eligible rooms.
        </p>
      )}
      {zones.map(({ zone, rooms: zoneRooms, sizeClass }) => (
        <section
          key={zone}
          className="rounded-lg border bg-card"
          data-testid={`boarding-zone-${zone}`}
        >
          <header className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">{zone}</h3>
            <Badge variant="outline" className="text-[10px]">
              {requiredClassLabel(sizeClass)}
            </Badge>
          </header>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2 p-3">
            {zoneRooms.map((room) => {
              const occupied = occByRoom.get(room.id);
              const elig = eligibleByRoom.get(room.id);
              const isEligible = !!elig && !!selectedRequiredClass;
              const isOverflow = !!elig?.is_overflow;
              const dimmed =
                !!selectedRequiredClass &&
                !occupied &&
                !isEligible &&
                (selectedRequiredClass === "large"
                  ? room.size_class !== "large"
                  : room.size_class === "large" && !isOverflow);

              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={!!occupied && !selectedRequiredClass}
                  data-testid={`boarding-zone-room-${room.room_number}`}
                  className={cn(
                    "relative min-h-[3.25rem] rounded border px-1 py-1.5 text-left text-[11px] transition-colors",
                    occupied && "border-primary/30 bg-primary/10",
                    !occupied && !selectedRequiredClass && "border-border bg-background",
                    isEligible &&
                      !isOverflow &&
                      "border-emerald-500 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60",
                    isEligible &&
                      isOverflow &&
                      "border-emerald-500 border-dashed bg-background hover:bg-emerald-50",
                    dimmed && "opacity-35",
                  )}
                  onClick={() =>
                    onRoomClick(room.id, {
                      isEligible: isEligible || isOverflow,
                      isOverflow,
                    })
                  }
                >
                  <div className="font-medium truncate">{roomLabel(room)}</div>
                  {occupied ? (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {occupantLabel(occupied)}
                    </div>
                  ) : isOverflow ? (
                    <Badge
                      variant="outline"
                      className="mt-1 h-4 px-1 text-[9px] border-amber-400 text-amber-800"
                    >
                      overflow
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
