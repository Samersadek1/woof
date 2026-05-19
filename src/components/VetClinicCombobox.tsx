import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVetClinicsQuery } from "@/hooks/useVetClinics";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface VetClinicComboboxProps {
  id?: string;
  value: string;
  onChange: (vetName: string) => void;
  /** Called when a clinic with a phone number is selected. */
  onPhoneChange?: (phone: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function VetClinicCombobox({
  id,
  value,
  onChange,
  onPhoneChange,
  disabled,
  placeholder = "Select vet clinic…",
}: VetClinicComboboxProps) {
  const [open, setOpen] = useState(false);
  const { data: clinicRows = [], isLoading } = useVetClinicsQuery({ activeOnly: true });

  const clinicsByName = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null }>();
    for (const row of clinicRows) {
      map.set(row.name, { name: row.name, phone: row.phone });
    }
    return map;
  }, [clinicRows]);

  const clinicNames = useMemo(() => clinicRows.map((r) => r.name), [clinicRows]);
  const trimmed = value.trim();
  const inList = trimmed.length > 0 && clinicsByName.has(trimmed);

  const triggerLabel = trimmed || placeholder;
  const busy = disabled || isLoading;

  function selectClinic(name: string) {
    onChange(name);
    const phone = clinicsByName.get(name)?.phone;
    if (phone && onPhoneChange) {
      onPhoneChange(phone);
    }
    setOpen(false);
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
            <CommandEmpty>
              {clinicNames.length === 0
                ? "No clinics yet. Add them in Settings → Vets."
                : "No clinic found."}
            </CommandEmpty>
            {!inList && trimmed.length > 0 ? (
              <CommandGroup heading="Current value (not in list)">
                <CommandItem value={`__saved__${trimmed}`} onSelect={() => selectClinic(trimmed)}>
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span className="truncate">{trimmed}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Clinics">
              {clinicNames.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => selectClinic(name)}>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
