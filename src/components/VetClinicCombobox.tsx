import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADD_CUSTOM_VET_CLINIC_OPTION, VET_CLINICS } from "@/data/vetClinics";
import { useVetClinicsQuery } from "@/hooks/useReferenceLists";
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

  const { data: clinicRows, isLoading } = useVetClinicsQuery();

  const clinicNames = useMemo(() => {
    if (clinicRows && clinicRows.length > 0) {
      return clinicRows.map((r) => r.name);
    }
    return [...VET_CLINICS];
  }, [clinicRows]);

  const clinicSet = useMemo(() => new Set(clinicNames), [clinicNames]);

  const trimmed = value.trim();
  const inList = trimmed.length > 0 && clinicSet.has(trimmed);

  const [manualChoice, setManualChoice] = useState(() => {
    const t = value.trim();
    return t.length > 0 && !clinicSet.has(t);
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
    if (clinicSet.has(t)) setManualChoice(false);
    else setManualChoice(true);
  }, [value, clinicSet]);

  function handleAddCustom() {
    preserveManualEmpty.current = true;
    setManualChoice(true);
    onChange("");
    setOpen(false);
  }

  function handleCancelCustom() {
    setManualChoice(false);
    onChange("");
  }

  const triggerLabel = useMemo(() => {
    if (!trimmed) return placeholder;
    return trimmed;
  }, [trimmed, placeholder]);

  const busy = disabled || isLoading;

  if (manualChoice) {
    return (
      <div className="flex gap-2 items-center min-w-0">
        <Input
          id={id}
          disabled={busy}
          placeholder="Enter clinic name…"
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
          aria-label="Cancel custom vet clinic"
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
          <span className="truncate text-left">{triggerLabel}</span>
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
              {clinicNames.map((name) => (
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
              <CommandItem value="__add_custom_vet__" onSelect={handleAddCustom}>
                <span className="font-medium text-muted-foreground">{ADD_CUSTOM_VET_CLINIC_OPTION}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
