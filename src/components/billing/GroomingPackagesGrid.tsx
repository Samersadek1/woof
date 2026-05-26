import { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { PET_SIZE_COLUMNS } from "@/lib/packageCatalog";
import {
  useGroomingPackageCatalog,
  useUpdateGroomingPackagePrice,
  type GroomingPackageCatalogRow,
} from "@/hooks/useGroomingPackages";

function priceCellKey(packageId: string, size: string) {
  return `${packageId}:${size}`;
}

export default function GroomingPackagesGrid() {
  const { data = [], isLoading } = useGroomingPackageCatalog();
  const updatePrice = useUpdateGroomingPackagePrice();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const activeRows = useMemo(
    () =>
      data
        .filter((row) => row.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name)),
    [data],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of activeRows) {
      for (const col of PET_SIZE_COLUMNS) {
        const price = row.prices[col.size];
        if (price) {
          next[priceCellKey(row.id, col.size)] = String(price.amount_aed);
        }
      }
    }
    setDraft(next);
  }, [activeRows]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const saveCell = (row: GroomingPackageCatalogRow, size: "small" | "medium" | "large", rawValue: string) => {
    const price = row.prices[size];
    if (!price) return;

    const key = priceCellKey(row.id, size);
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
        await updatePrice.mutateAsync({ pricingId: price.id, amount_aed: amount });
        toast.success("Grooming package price saved.");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to save grooming package price.");
      }
    }, 250);
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (activeRows.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground text-center">
        No active grooming packages found.
      </p>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="min-w-[220px]">Package</TableHead>
            {PET_SIZE_COLUMNS.map((col) => (
              <TableHead key={col.size} className="min-w-[120px] text-right">
                {col.label}
              </TableHead>
            ))}
            <TableHead className="min-w-[160px]">Includes</TableHead>
            <TableHead className="min-w-[90px] text-center">Validity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="text-sm font-medium">{row.display_name}</p>
                {row.description ? (
                  <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                ) : null}
              </TableCell>
              {PET_SIZE_COLUMNS.map((col) => {
                const price = row.prices[col.size];
                const key = priceCellKey(row.id, col.size);
                return (
                  <TableCell key={col.size} className="text-right">
                    {price ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-[120px] ml-auto text-right h-8 text-sm"
                        value={draft[key] ?? String(price.amount_aed)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraft((prev) => ({ ...prev, [key]: value }));
                          saveCell(row, col.size, value);
                        }}
                        onBlur={(e) => saveCell(row, col.size, e.target.value)}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
              <TableCell className="text-sm text-muted-foreground">{row.includes || "—"}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline">{row.validity_months}m</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
