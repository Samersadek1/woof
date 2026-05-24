import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DOG_SIZE_FORM_OPTIONS,
  type DogSizeFormValue,
} from "@/lib/dogSizeForm";

export function DogSizeField({
  value,
  onChange,
  name,
  label = "Dog size",
  required = false,
  missingProfileHint,
}: {
  value: DogSizeFormValue | null;
  onChange: (v: DogSizeFormValue) => void;
  /** Unique `name` for the radio group (required when multiple groups exist on one page). */
  name: string;
  label?: string;
  /** Show required styling when size must be chosen before save. */
  required?: boolean;
  /** Shown when selected pet(s) have no size on file — staff must confirm here. */
  missingProfileHint?: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-medium">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {missingProfileHint ? (
          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900 text-[10px]">
            Size missing on profile
          </Badge>
        ) : null}
      </div>
      {missingProfileHint ? (
        <p className="text-xs text-amber-800/90 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1.5">
          {missingProfileHint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {DOG_SIZE_FORM_OPTIONS.map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-2 text-sm font-normal"
          >
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="h-4 w-4 accent-primary"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}
