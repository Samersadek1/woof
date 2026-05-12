import { Label } from "@/components/ui/label";
import {
  DOG_SIZE_FORM_OPTIONS,
  type DogSizeFormValue,
} from "@/lib/dogSizeForm";

export function DogSizeField({
  value,
  onChange,
  name,
  label = "Dog size",
}: {
  value: DogSizeFormValue;
  onChange: (v: DogSizeFormValue) => void;
  /** Unique `name` for the radio group (required when multiple groups exist on one page). */
  name: string;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
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
