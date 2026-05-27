import { memo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useDismissOnOutsidePointer } from "@/hooks/useDismissOnOutsidePointer";
import { useOwners } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { cn } from "@/lib/utils";

export type OwnerClientSearchProps = {
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  inputTestId?: string;
  optionTestIdPrefix?: string;
  className?: string;
  selectedId?: string | null;
  selectedLabel?: string | null;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
};

export const OwnerClientSearch = memo(function OwnerClientSearch({
  placeholder = "Search client or pet name / phone…",
  minChars = 1,
  debounceMs = 0,
  inputTestId,
  optionTestIdPrefix,
  className,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
}: OwnerClientSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, debounceMs);
  const searchTerm =
    debouncedQuery.trim().length >= minChars ? debouncedQuery.trim() : undefined;
  const { data: owners = [], isLoading } = useOwners(searchTerm);

  useDismissOnOutsidePointer(wrapperRef, open, () => setOpen(false));

  if (selectedId && selectedLabel) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm",
          className,
        )}
      >
        <span className="flex-1 font-medium truncate">{selectedLabel}</span>
        <button
          type="button"
          onClick={() => {
            onClear();
            setQuery("");
          }}
          className="rounded-full p-0.5 hover:bg-muted shrink-0"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  const showDropdown = open && query.trim().length >= minChars;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid={inputTestId}
        className="pl-9"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {showDropdown ? (
        <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {isLoading ? (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          ) : owners.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No clients or pets found</li>
          ) : (
            owners.slice(0, 12).map((o) => {
              const label = ownerDisplayName(o.first_name, o.last_name);
              const petNames = (o.pets ?? []).map((p) => p.name).filter(Boolean).join(", ");
              const details = [petNames, o.phone].filter(Boolean).join(" · ");
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-${o.id}` : undefined}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(o.id, label);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{label}</span>
                    {details ? (
                      <span className="ml-2 text-xs text-muted-foreground">{details}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
});
