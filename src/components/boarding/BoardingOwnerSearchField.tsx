import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useOwners } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";

type Props = {
  ownerId: string;
  onOwnerIdChange: (id: string) => void;
  /** Called when the drawer opens or owner is cleared — reset display text. */
  resetKey?: string | number;
};

/**
 * Isolated owner search for the new-boarding drawer so keystrokes do not re-render
 * the full boarding calendar.
 */
export function BoardingOwnerSearchField({ ownerId, onOwnerIdChange, resetKey }: Props) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const { data: results = [] } = useOwners(
    debouncedSearch.trim().length >= 2 ? debouncedSearch : undefined,
  );

  useEffect(() => {
    setSearch("");
    setDropdownOpen(false);
  }, [resetKey]);

  return (
    <div className="relative w-full max-w-md">
      <Input
        data-testid="boarding-owner-search"
        placeholder="Search by name or phone…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (ownerId) onOwnerIdChange("");
          setDropdownOpen(true);
        }}
        onFocus={() => search.trim().length >= 2 && setDropdownOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setDropdownOpen(false), 150);
        }}
        aria-expanded={dropdownOpen && search.trim().length >= 2}
        aria-autocomplete="list"
      />
      {dropdownOpen && search.trim().length >= 2 ? (
        <ul
          className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          role="listbox"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No owners found.</li>
          ) : (
            results.map((o) => (
              <li key={o.id} role="option">
                <button
                  data-testid={`boarding-owner-option-${o.id}`}
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onOwnerIdChange(o.id);
                    setSearch(`${ownerDisplayName(o.first_name, o.last_name)} — ${o.phone}`);
                    setDropdownOpen(false);
                  }}
                >
                  <span className="font-medium">{ownerDisplayName(o.first_name, o.last_name)}</span>
                  <span className="ml-2 text-muted-foreground">{o.phone}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
