import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { COMMON_NATIONALITIES, WORLD_COUNTRIES_REST } from "@/data/worldCountries";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface NationalityComboboxProps {
  id?: string;
  value: string;
  onChange: (nationality: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function NationalityCombobox({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Nationality (optional)",
}: NationalityComboboxProps) {
  const [open, setOpen] = useState(false);

  const countrySet = useMemo(() => {
    const s = new Set<string>();
    for (const c of COMMON_NATIONALITIES) s.add(c.value);
    for (const c of WORLD_COUNTRIES_REST) s.add(c);
    return s;
  }, []);

  const trimmed = value.trim();
  const inList = trimmed.length > 0 && countrySet.has(trimmed);

  const triggerLabel = useMemo(() => {
    if (!trimmed) return placeholder;
    return trimmed;
  }, [trimmed, placeholder]);

  // Match SelectTrigger (see `select.tsx`) so this reads as a dropdown, not another text input.
  const triggerClassName = cn(
    "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
    !trimmed && "text-muted-foreground",
  );

  return (
    // `modal={false}` avoids focus/stacking conflicts when this sits inside a Sheet or Dialog (Add Owner).
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={triggerClassName}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[200] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder="Search countries…" />
          <CommandList className="max-h-[min(60vh,320px)]">
            <CommandEmpty>No country found.</CommandEmpty>
            {!inList && trimmed.length > 0 ? (
              <CommandGroup heading="Current value (not in list)">
                <CommandItem
                  value={`__saved__${trimmed}`}
                  keywords={[trimmed]}
                  onSelect={() => {
                    onChange(trimmed);
                    setOpen(false);
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span className="truncate">{trimmed}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Common">
              {COMMON_NATIONALITIES.map((c) => (
                <CommandItem
                  key={c.value}
                  value={`${c.label} ${c.value} ${c.keywords.join(" ")}`}
                  keywords={[c.label, c.value, ...c.keywords]}
                  onSelect={() => {
                    onChange(c.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      trimmed === c.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{c.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="All countries">
              {WORLD_COUNTRIES_REST.map((country) => (
                <CommandItem
                  key={country}
                  value={country}
                  keywords={[country]}
                  onSelect={() => {
                    onChange(country);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      trimmed === country ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{country}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__clear_nationality__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <span className="font-medium text-muted-foreground">Clear selection</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
