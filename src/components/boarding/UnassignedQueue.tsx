import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnassignedBoardingRow } from "@/hooks/useBoardingCapacity";
import { requiredClassLabel } from "@/lib/boardingCapacity";
import { cn } from "@/lib/utils";

const LIST_CAP = 50;

type FilterChip = "all" | "large" | "standard" | "arriving_today";

type Props = {
  rows: UnassignedBoardingRow[];
  isLoading?: boolean;
  selectedBookingId: string | null;
  onSelect: (row: UnassignedBoardingRow) => void;
};

function arrivalLabel(arrival: UnassignedBoardingRow["arrival"]): string {
  switch (arrival) {
    case "arriving_today":
      return "arriving today";
    case "here_now":
      return "here now";
    default:
      return "upcoming";
  }
}

export function UnassignedQueue({
  rows,
  isLoading,
  selectedBookingId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");

  const counts = useMemo(() => {
    const large = rows.filter((r) => r.required_class === "large").length;
    const standard = rows.filter((r) => r.required_class === "standard").length;
    const arriving = rows.filter((r) => r.arrival === "arriving_today").length;
    return { large, standard, arriving };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "large" && row.required_class !== "large") return false;
      if (filter === "standard" && row.required_class !== "standard") return false;
      if (filter === "arriving_today" && row.arrival !== "arriving_today") return false;
      if (!q) return true;
      const hay = [row.dog_names, row.owner_name, row.booking_ref]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filter]);

  const visible = filtered.slice(0, LIST_CAP);
  const hiddenCount = Math.max(0, filtered.length - LIST_CAP);

  const chips: { id: FilterChip; label: string }[] = [
    { id: "all", label: `All ${rows.length}` },
    { id: "large", label: `Large ${counts.large}` },
    { id: "standard", label: `Standard ${counts.standard}` },
    { id: "arriving_today", label: `Arriving today ${counts.arriving}` },
  ];

  return (
    <div
      className="flex h-full min-h-0 flex-col border-r bg-card"
      data-testid="boarding-unassigned-queue"
    >
      <div className="shrink-0 space-y-2 border-b p-3">
        <h2 className="text-sm font-semibold">Unassigned · {rows.length}</h2>
        <Input
          data-testid="boarding-unassigned-search"
          placeholder="Search dog or owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                filter === chip.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "All dogs have a kennel tonight." : "No matches."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((row) => {
              const selected = selectedBookingId === row.booking_id;
              const classChip =
                row.required_class === "large" && row.has_restriction
                  ? "large · restriction"
                  : requiredClassLabel(row.required_class).toLowerCase();
              return (
                <li key={row.booking_id}>
                  <button
                    type="button"
                    data-testid={`boarding-unassigned-row-${row.booking_id}`}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-background hover:bg-muted/60",
                      row.required_class === "large" &&
                        !selected &&
                        "border-amber-300/60 bg-amber-50/50",
                    )}
                    onClick={() => onSelect(row)}
                  >
                    <div className="font-medium leading-snug truncate">
                      {row.dog_names || "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {row.owner_name || "Owner"}
                      {row.booking_ref ? ` · ${row.booking_ref}` : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {row.pet_count} dog{row.pet_count !== 1 ? "s" : ""}
                      </Badge>
                      <Badge
                        variant={row.required_class === "large" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {classChip}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {arrivalLabel(row.arrival)}
                      </Badge>
                    </div>
                  </button>
                </li>
              );
            })}
            {hiddenCount > 0 && (
              <li className="py-2 text-center text-xs text-muted-foreground">
                {hiddenCount} more — narrow with search or filters
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
