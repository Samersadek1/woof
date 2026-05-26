import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOwners } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";

type OwnerSearchPopoverProps = {
  label?: ReactNode;
  placeholder?: string;
  ownerId: string | undefined;
  ownerLabel: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
  inputTestId?: string;
  /** e.g. `boarding-owner-option` → `boarding-owner-option-<uuid>` on each row */
  optionTestIdPrefix?: string;
};

export function OwnerSearchPopover({
  label = "Owner",
  placeholder = "Search name/phone",
  ownerId,
  ownerLabel,
  onSelect,
  onClear,
  inputTestId,
  optionTestIdPrefix,
}: OwnerSearchPopoverProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data: hits = [] } = useOwners(search.trim().length >= 2 ? search : undefined);

  useEffect(() => {
    if (ownerId) setSearch("");
  }, [ownerId]);

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              data-testid={inputTestId}
              className="pl-9"
              placeholder={placeholder}
              value={ownerLabel || search}
              onChange={(e) => {
                setSearch(e.target.value);
                onClear();
                if (e.target.value.trim().length >= 2) setOpen(true);
              }}
              onFocus={() => {
                if (!ownerId && search.trim().length >= 2) setOpen(true);
              }}
              autoComplete="off"
            />
          </div>
        </PopoverTrigger>
        {open && !ownerId && search.trim().length >= 2 && hits.length > 0 && (
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0 z-[120]"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <ul className="max-h-48 overflow-y-auto divide-y">
              {hits.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-${o.id}` : undefined}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(o.id, ownerDisplayName(o.first_name, o.last_name));
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    {ownerDisplayName(o.first_name, o.last_name)}{" "}
                    <span className="text-muted-foreground">{o.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
