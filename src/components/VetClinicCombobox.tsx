import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  VET_CLINICS,
  VET_CLINICS_SET,
  VET_NOT_LISTED_OPTION,
} from "@/data/vetClinics";
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

export interface VetClinicComboboxProps {
  id?: string;
  value: string;
  onChange: (vetName: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function VetClinicCombobox({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Select vet clinic…",
}: VetClinicComboboxProps) {
  const [open, setOpen] = useState(false);
  const preserveManualEmpty = useRef(false);

  const trimmed = value.trim();
  const inList = trimmed.length > 0 && VET_CLINICS_SET.has(trimmed);

  const [manualChoice, setManualChoice] = useState(() => {
    const t = value.trim();
    return t.length > 0 && !VET_CLINICS_SET.has(t);
  });

  useEffect(() => {
    const t = value.trim();
    if (t.length === 0) {
      if (preserveManualEmpty.current) {
        preserveManualEmpty.current = false;
        return;
      }
      setManualChoice(false);
      return;
    }
    if (VET_CLINICS_SET.has(t)) setManualChoice(false);
    else setManualChoice(true);
  }, [value]);

  const triggerLabel = useMemo(() => {
    if (inList) return trimmed;
    if (manualChoice) return trimmed.length > 0 ? trimmed : VET_NOT_LISTED_OPTION;
    if (trimmed.length > 0) return trimmed;
    return placeholder;
  }, [inList, manualChoice, trimmed, placeholder]);

  const showManualInput = manualChoice;

  function handleNotListed() {
    preserveManualEmpty.current = true;
    setManualChoice(true);
    onChange("");
    setOpen(false);
  }

  return (
    <div className="space-y-2">
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
              !trimmed && !manualChoice && "text-muted-foreground",
            )}
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Type to filter…" />
            <CommandList>
              <CommandEmpty>No clinic found.</CommandEmpty>
              {!inList && trimmed.length > 0 ? (
                <CommandGroup heading="Current value (not in list)">
                  <CommandItem
                    value={`__saved__${trimmed}`}
                    onSelect={() => {
                      onChange(trimmed);
                      setManualChoice(true);
                      setOpen(false);
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-100" />
                    <span className="truncate">{trimmed}</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Clinics">
                {VET_CLINICS.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      onChange(name);
                      setManualChoice(false);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        trimmed === name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value={VET_NOT_LISTED_OPTION} onSelect={handleNotListed}>
                  <span className="font-medium text-muted-foreground">{VET_NOT_LISTED_OPTION}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showManualInput ? (
        <Input
          id={id ? `${id}-manual` : undefined}
          aria-label="Clinic name (manual entry)"
          disabled={disabled}
          placeholder="Enter clinic name…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10"
        />
      ) : null}
    </div>
  );
}
