import { format, parseISO } from "date-fns";
import { Search, X } from "lucide-react";

import {
  useBoardingBookingSearch,
  type BoardingBookingSearchHit,
} from "@/hooks/useBookings";
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
  value: string;
  onChange: (value: string) => void;
  onSelect: (hit: BoardingBookingSearchHit) => void;
  className?: string;
};

export function BoardingBookingSearch({ value, onChange, onSelect, className }: Props) {
  const { data: hits = [], isFetching } = useBoardingBookingSearch(value);
  const showDropdown = boardingBookingSearchActive(value);

  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid="boarding-booking-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search ref, owner, pet…"
        className="h-9 pl-9 pr-9"
        aria-label="Search boarding bookings"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />
      {value.trim() ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      {showDropdown ? (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
          role="listbox"
        >
          {isFetching && hits.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          ) : null}
          {!isFetching && hits.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No boarding bookings found.</li>
          ) : null}
          {hits.map((hit) => (
            <li key={hit.id} role="option">
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/60"
                data-testid={`boarding-booking-search-hit-${hit.id}`}
                onClick={() => onSelect(hit)}
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
}
