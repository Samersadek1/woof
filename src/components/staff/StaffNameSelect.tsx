import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useStaff } from "@/hooks/useStaff";
import { staffDisplayName, useCurrentStaffName } from "@/hooks/useCurrentStaffName";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  required?: boolean;
  /** When true, show free-text override field below the dropdown */
  allowCustom?: boolean;
};

export function StaffNameSelect({
  value,
  onChange,
  label = "Processed by",
  id,
  required = true,
  allowCustom = true,
}: Props) {
  const { staffName: defaultName } = useCurrentStaffName();
  const { data: staffRows = [] } = useStaff();

  const activeStaff = useMemo(
    () => staffRows.filter((s) => s.active).sort((a, b) => staffDisplayName(a).localeCompare(staffDisplayName(b))),
    [staffRows],
  );

  const options = useMemo(() => {
    const names = new Set<string>();
    if (defaultName) names.add(defaultName);
    for (const s of activeStaff) {
      const n = staffDisplayName(s);
      if (n) names.add(n);
    }
    if (value.trim()) names.add(value.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [activeStaff, defaultName, value]);

  useEffect(() => {
    if (!value.trim() && defaultName) {
      onChange(defaultName);
    }
  }, [defaultName, onChange, value]);

  const selectValue = value.trim() && options.includes(value.trim()) ? value.trim() : "__custom__";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__custom__") return;
          onChange(v);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select staff member" />
        </SelectTrigger>
        <SelectContent>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          {allowCustom ? <SelectItem value="__custom__">Other (type below)</SelectItem> : null}
        </SelectContent>
      </Select>
      {allowCustom && (selectValue === "__custom__" || !options.includes(value.trim())) ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Staff name"
        />
      ) : null}
    </div>
  );
}
