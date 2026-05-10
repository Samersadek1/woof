import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { COMMON_NATIONALITIES, WORLD_COUNTRIES_REST } from "@/data/worldCountries";
import { Button } from "@/components/ui/button";
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between font-normal",
            !trimmed && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
