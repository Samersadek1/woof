import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type GroomingPackage,
  type PetSize,
  useGroomingRates,
  useUpdateGroomingRate,
} from "@/hooks/useGroomingRates";

const SIZE_COLUMNS: { size: PetSize; label: string }[] = [
  { size: "S", label: "Small (up to 10kg)" },
  { size: "M", label: "Medium (10–20kg)" },
  { size: "L", label: "Large (20–35kg)" },
  { size: "XL", label: "X-Large (35kg+)" },
];

const PACKAGE_ROWS: { pkg: GroomingPackage; label: string }[] = [
  { pkg: "grande", label: "Grande (Full Groom)" },
  { pkg: "bijoux", label: "Bijoux (Bath + Trim)" },
  { pkg: "deshedding_long", label: "Deshedding — Long coat" },
  { pkg: "deshedding_smooth", label: "Deshedding — Smooth coat" },
  { pkg: "bath_blow", label: "Bath & Blow" },
];

export default function GroomingPricingGrid() {
  const { data = [], isLoading } = useGroomingRates();
  const updateRate = useUpdateGroomingRate();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const rateByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data) map.set(`${r.package}:${r.size}`, Number(r.amount_aed ?? 0));
    return map;
  }, [data]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of PACKAGE_ROWS) {
      for (const col of SIZE_COLUMNS) {
        const key = `${row.pkg}:${col.size}`;
        next[key] = String(rateByKey.get(key) ?? 0);
      }
    }
    setDraft(next);
  }, [rateByKey]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const lastUpdated = useMemo(() => {
    if (!data.length) return null;
    const latest = data
      .map((r) => r.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    return latest ?? null;
  }, [data]);

  const saveCell = (pkg: GroomingPackage, size: PetSize, rawValue: string) => {
    const key = `${pkg}:${size}`;
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
    }
    timersRef.current[key] = setTimeout(async () => {
      const amount = Number.parseFloat(rawValue);
      if (Number.isNaN(amount) || amount < 0) {
        toast.error("Enter a valid amount.");
        return;
      }
      try {
        await updateRate.mutateAsync({
          package: pkg,
          size,
          amount_aed: amount,
        });
        toast.success("Grooming rate saved.");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to save grooming rate.");
      }
    }, 250);
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[220px]">Package</TableHead>
              {SIZE_COLUMNS.map((col) => (
                <TableHead key={col.size} className="min-w-[180px] text-right">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PACKAGE_ROWS.map((row) => (
              <TableRow key={row.pkg}>
                <TableCell className="text-sm font-medium">{row.label}</TableCell>
                {SIZE_COLUMNS.map((col) => {
                  const key = `${row.pkg}:${col.size}`;
                  const value = draft[key] ?? "0";
                  return (
                    <TableCell key={key} className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">AED</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[120px] h-8 text-right"
                          value={value}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          onBlur={(e) => saveCell(row.pkg, col.size, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {lastUpdated
          ? `Last updated: ${format(parseISO(lastUpdated), "d MMM yyyy, HH:mm")}`
          : "No updates yet."}
      </p>
    </div>
  );
}
