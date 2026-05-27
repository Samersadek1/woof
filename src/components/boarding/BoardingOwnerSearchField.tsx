import { memo, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useDismissOnOutsidePointer } from "@/hooks/useDismissOnOutsidePointer";
import { useOwner, useOwners } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";

type Props = {
  ownerId: string;
  onOwnerIdChange: (id: string) => void;
  /** Increment when the new-booking drawer opens to reset search. */
  resetKey?: string | number;
};

export const BoardingOwnerSearchField = memo(function BoardingOwnerSearchField({
  ownerId,
  onOwnerIdChange,
  resetKey,
}: Props) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { data: results = [] } = useOwners(
    debouncedSearch.trim().length >= 2 ? debouncedSearch : undefined,
  );
  const { data: selectedOwner } = useOwner(ownerId);

  useEffect(() => {
    setSearch("");
    setDropdownOpen(false);
  }, [resetKey]);

  useDismissOnOutsidePointer(wrapperRef, dropdownOpen, () => setDropdownOpen(false));

  const selectedLabel = selectedOwner
    ? `${ownerDisplayName(selectedOwner.first_name, selectedOwner.last_name)} — ${selectedOwner.phone}`
    : null;

  if (ownerId && selectedLabel) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm max-w-md">
        <span className="flex-1 font-medium truncate">{selectedLabel}</span>
        <button
          type="button"
          className="rounded-full p-0.5 hover:bg-muted shrink-0"
          aria-label="Clear owner"
          onClick={() => {
            onOwnerIdChange("");
            setSearch("");
            setDropdownOpen(false);
          }}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  const showDropdown = dropdownOpen && search.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <Input
        data-testid="boarding-owner-search"
        placeholder="Search by name or phone…"
        value={search}
        onChange={(e) => {
          const input = e.target;
          const hadFocus = document.activeElement === input;
          setSearch(e.target.value);
          setDropdownOpen(true);
          // #region agent log
          requestAnimationFrame(() => {
            fetch("http://127.0.0.1:7660/ingest/ef44b5b8-e0cd-43f6-8b62-f750ed144fa8", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ee2093" },
              body: JSON.stringify({
                sessionId: "ee2093",
                runId: "post-fix-v2",
                hypothesisId: "C,D",
                location: "BoardingOwnerSearchField.tsx:onChange",
                message: "owner search keystroke",
                data: {
                  hadFocusBefore: hadFocus,
                  hasFocusAfter: document.activeElement === input,
                  valueLen: e.target.value.length,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
          });
          // #endregion
        }}
        onFocus={() => search.trim().length >= 2 && setDropdownOpen(true)}
        autoComplete="off"
      />
      {showDropdown ? (
        <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No owners found.</li>
          ) : (
            results.map((o) => (
              <li key={o.id}>
                <button
                  data-testid={`boarding-owner-option-${o.id}`}
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onOwnerIdChange(o.id);
                    setSearch("");
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
});
