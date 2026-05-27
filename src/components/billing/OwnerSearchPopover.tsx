import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { OwnerClientSearch } from "@/components/OwnerClientSearch";

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
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <OwnerClientSearch
        placeholder={placeholder}
        minChars={2}
        inputTestId={inputTestId}
        optionTestIdPrefix={optionTestIdPrefix}
        selectedId={ownerId ?? null}
        selectedLabel={ownerLabel || null}
        onSelect={onSelect}
        onClear={onClear}
      />
    </div>
  );
}
