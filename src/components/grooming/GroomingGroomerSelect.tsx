import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroomingGroomerRow } from "@/hooks/useGroomingGroomers";
import {
  GROOMER_OTHER_VALUE,
  resolveGroomerStoredValue,
  splitGroomerStoredValue,
} from "@/lib/groomingGroomerForm";

type Props = {
  groomers: GroomingGroomerRow[];
  value: string;
  onChange: (name: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  showPreferredHint?: boolean;
};

export function GroomingGroomerSelect({
  groomers,
  value,
  onChange,
  label = "Groomer",
  id = "grooming-groomer-select",
  disabled = false,
  showPreferredHint = false,
}: Props) {
  const parsed = useMemo(() => splitGroomerStoredValue(value, groomers), [value, groomers]);
  const [choice, setChoice] = useState(parsed.choice);
  const [otherName, setOtherName] = useState(parsed.otherName);

  useEffect(() => {
    setChoice(parsed.choice);
    setOtherName(parsed.otherName);
  }, [parsed.choice, parsed.otherName]);

  const emit = (nextChoice: string, nextOther: string) => {
    onChange(resolveGroomerStoredValue(nextChoice, nextOther));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={choice || undefined}
        onValueChange={(next) => {
          setChoice(next);
          emit(next, otherName);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} data-testid="grooming-groomer-select">
          <SelectValue placeholder="Select groomer" />
        </SelectTrigger>
        <SelectContent>
          {groomers.map((g) => (
            <SelectItem key={g.id} value={g.name}>
              {g.name}
            </SelectItem>
          ))}
          <SelectItem value={GROOMER_OTHER_VALUE}>Other…</SelectItem>
        </SelectContent>
      </Select>
      {choice === GROOMER_OTHER_VALUE ? (
        <Input
          data-testid="grooming-groomer-other-input"
          value={otherName}
          onChange={(e) => {
            const next = e.target.value;
            setOtherName(next);
            emit(GROOMER_OTHER_VALUE, next);
          }}
          placeholder="Groomer name"
          disabled={disabled}
        />
      ) : null}
      {showPreferredHint ? (
        <p className="text-xs text-muted-foreground">Preferred groomer from client profile</p>
      ) : null}
    </div>
  );
}
