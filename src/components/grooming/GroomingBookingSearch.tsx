import { memo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search, X } from "lucide-react";
import { useBookingsForGroomingLink, type BookingLinkRow } from "@/hooks/useGrooming";
import { useDismissOnOutsidePointer } from "@/hooks/useDismissOnOutsidePointer";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { formatGroomingBookingLinkPets } from "@/lib/groomingBookingLinkSearch";
import { boardingBookingSearchActive } from "@/lib/boardingBookingSearch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  onSelect: (hit: BookingLinkRow) => void;
  selectedHit?: BookingLinkRow | null;
  onClear?: () => void;
  className?: string;
};

export const GroomingBookingSearch = memo(function GroomingBookingSearch({
  onSelect,
  selectedHit,
  onClear,
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { data: hits = [], isFetching } = useBookingsForGroomingLink(value);
  const showDropdown = boardingBookingSearchActive(value) && !selectedHit;

  useDismissOnOutsidePointer(wrapperRef, open && showDropdown, () => setOpen(false));

  if (selectedHit) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm",
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-medium">
            {selectedHit.booking_ref ?? selectedHit.id.slice(0, 8)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatGroomingBookingLinkPets(selectedHit)} ·{" "}
            {selectedHit.owners
              ? ownerDisplayName(selectedHit.owners.first_name, selectedHit.owners.last_name)
              : "—"}{" "}
            · {format(parseISO(selectedHit.check_in_date), "d MMM")} –{" "}
            {format(parseISO(selectedHit.check_out_date), "d MMM yyyy")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onClear?.();
            setValue("");
          }}
          className="rounded-full p-0.5 hover:bg-muted shrink-0"
          aria-label="Clear booking"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid="grooming-booking-search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search booking ref, owner, pet, or phone…"
        className="h-9 pl-9 pr-9"
        aria-label="Find booking for grooming"
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
            <li className="px-3 py-2 text-muted-foreground">No bookings found.</li>
          ) : null}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/60"
                data-testid={`grooming-booking-search-hit-${hit.id}`}
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
                  {formatGroomingBookingLinkPets(hit)} ·{" "}
                  {hit.owners
                    ? ownerDisplayName(hit.owners.first_name, hit.owners.last_name)
                    : "—"}
                  {hit.owners?.phone ? ` · ${hit.owners.phone}` : ""} ·{" "}
                  {format(parseISO(hit.check_in_date), "d MMM")} –{" "}
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
