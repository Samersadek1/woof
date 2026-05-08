import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { PET_BREEDS } from "@/data/petBreeds";
import { useDogBreedsQuery } from "@/hooks/useReferenceLists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Shown at bottom of breed list — never stored as `breed`; opens custom entry. */
export const ADD_CUSTOM_BREED_OPTION = "+ Add custom breed";

export interface PetBreedComboboxProps {
  id?: string;
  value: string;
  onChange: (breed: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PetBreedCombobox({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Select breed…",
}: PetBreedComboboxProps) {
  const [open, setOpen] = useState(false);
  const preserveCustomEmpty = useRef(false);

  const { data: breedRows, isLoading } = useDogBreedsQuery();

  const breedNames = useMemo(() => {
    if (breedRows && breedRows.length > 0) {
      return breedRows.map((r) => r.name);
    }
    return [...PET_BREEDS];
  }, [breedRows]);

  const breedSet = useMemo(() => new Set(breedNames), [breedNames]);

  const trimmed = value.trim();
  const inList = trimmed.length > 0 && breedSet.has(trimmed);

  const [customBreedMode, setCustomBreedMode] = useState(() => {
    const t = value.trim();
    return t.length > 0 && !breedSet.has(t);
  });

  useEffect(() => {
    const t = value.trim();
    if (t.length === 0) {
      if (preserveCustomEmpty.current) {
        preserveCustomEmpty.current = false;
        return;
      }
      setCustomBreedMode(false);
      return;
    }
    if (breedSet.has(t)) setCustomBreedMode(false);
    else setCustomBreedMode(true);
  }, [value, breedSet]);

  function handleAddCustom() {
    preserveCustomEmpty.current = true;
    setCustomBreedMode(true);
    onChange("");
    setOpen(false);
  }

  function handleCancelCustom() {
    setCustomBreedMode(false);
    onChange("");
  }

  const displayLabel = useMemo(() => {
    if (!trimmed) return placeholder;
    return trimmed;
  }, [trimmed, placeholder]);

  const busy = disabled || isLoading;

  if (customBreedMode) {
    return (
      <div className="flex gap-2 items-center min-w-0">
        <Input
          id={id}
          disabled={busy}
          placeholder="Enter breed name…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 flex-1 min-w-0"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={busy}
          aria-label="Cancel custom breed"
          onClick={handleCancelCustom}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={busy}
          className={cn(
            "h-10 w-full justify-between font-normal",
            !trimmed && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{displayLabel}</span>
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>No breed found.</CommandEmpty>
            {!inList && trimmed.length > 0 ? (
              <CommandGroup heading="Current value (not in list)">
                <CommandItem
                  value={`__saved__${trimmed}`}
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
            <CommandGroup heading="Breeds">
              {breedNames.map((breed) => (
                <CommandItem
                  key={breed}
                  value={breed}
                  keywords={[breed]}
                  onSelect={() => {
                    onChange(breed);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      trimmed === breed ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{breed}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__add_custom_breed__" onSelect={handleAddCustom}>
                <span className="font-medium text-muted-foreground">{ADD_CUSTOM_BREED_OPTION}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
