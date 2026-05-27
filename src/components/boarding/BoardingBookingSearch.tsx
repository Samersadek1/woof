import { memo, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { format, parseISO } from "date-fns";
import { Search, X } from "lucide-react";

import {
  useBoardingBookingSearch,
  type BoardingBookingSearchHit,
} from "@/hooks/useBookings";
import { useDismissOnOutsidePointer } from "@/hooks/useDismissOnOutsidePointer";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { boardingBookingSearchActive } from "@/lib/boardingBookingSearch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatHitPets(hit: BoardingBookingSearchHit): string {
  return (
    hit.booking_pets
      .map((bp) => bp.pets?.name)
      .filter(Boolean)
      .join(", ") || "—"
  );
}

type Props = {
  onSelect: (hit: BoardingBookingSearchHit) => void;
  /** Debounced query for calendar/list filtering (parent should not store raw keystrokes). */
  onFilterChange?: (debouncedQuery: string) => void;
  className?: string;
};

/** Hub toolbar search — keeps query state internal so the boarding page does not re-render per keystroke. */
export const BoardingBookingSearch = memo(function BoardingBookingSearch({
  onSelect,
  onFilterChange,
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedValue = useDebounce(value, 300);
  const { data: hits = [], isFetching } = useBoardingBookingSearch(value);
  const showDropdown = boardingBookingSearchActive(value);

  useEffect(() => {
    onFilterChange?.(debouncedValue.trim());
  }, [debouncedValue, onFilterChange]);

  useDismissOnOutsidePointer(wrapperRef, open && showDropdown, () => setOpen(false));

  return (
    <div ref={wrapperRef} className={cn("relative w-full max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid="boarding-booking-search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search ref, owner, pet…"
        className="h-9 pl-9 pr-9"
        aria-label="Search boarding bookings"
        autoComplete="off"
      />
      {value.trim() ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            setOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      {open && showDropdown ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover text-sm shadow-md">
          {isFetching && hits.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          ) : null}
          {!isFetching && hits.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No boarding bookings found.</li>
          ) : null}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/60"
                data-testid={`boarding-booking-search-hit-${hit.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(hit);
                  setValue(hit.booking_ref ?? hit.id);
                  setOpen(false);
                }}
              >
                <span className="font-mono text-xs font-medium">
                  {hit.booking_ref ?? hit.id.slice(0, 8)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {formatHitPets(hit)} ·{" "}
                  {hit.owners
                    ? ownerDisplayName(hit.owners.first_name, hit.owners.last_name)
                    : "—"}{" "}
                  · {format(parseISO(hit.check_in_date), "d MMM")} –{" "}
                  {format(parseISO(hit.check_out_date), "d MMM yyyy")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
