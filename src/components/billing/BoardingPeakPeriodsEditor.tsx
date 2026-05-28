import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeactivatePeakPeriod,
  usePeakPeriods,
  useUpsertPeakPeriod,
} from "@/hooks/usePeakPeriods";
import {
  defaultPeakPeriodLabel,
  formatPeakPeriodRange,
} from "@/lib/peakPeriods";
import { cn } from "@/lib/utils";

function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseRange(range: DateRange | undefined): { start: string; end: string } | null {
  if (!range?.from) return null;
  const start = toIsoDate(range.from);
  const end = toIsoDate(range.to ?? range.from);
  return { start, end };
}

export function BoardingPeakPeriodsEditor() {
  const { data: periods = [], isLoading } = usePeakPeriods();
  const upsert = useUpsertPeakPeriod();
  const deactivate = useDeactivatePeakPeriod();

  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [range, setRange] = useState<DateRange | undefined>();

  const rangeLabel = useMemo(() => {
    const parsed = parseRange(range);
    if (!parsed) return "Pick peak dates";
    return formatPeakPeriodRange(parsed.start, parsed.end);
  }, [range]);

  const handleAdd = async () => {
    const parsed = parseRange(range);
    if (!parsed) return;
    await upsert.mutateAsync({
      label: label.trim() || defaultPeakPeriodLabel(parsed.start, parsed.end),
      startDate: parsed.start,
      endDate: parsed.end,
    });
    setLabel("");
    setRange(undefined);
    setAddOpen(false);
  };

  const sorted = useMemo(
    () =>
      [...periods].sort((a, b) => {
        const aStart = a.start_date ?? "";
        const bStart = b.start_date ?? "";
        return aStart.localeCompare(bStart);
      }),
    [periods],
  );

  return (
    <div className="border-t bg-muted/20 px-4 py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Peak calendar dates</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Nights on these dates use the peak rate; all other nights use off-peak.
          </p>
        </div>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Add peak range
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-3 space-y-3 border-b">
              <div className="space-y-1.5">
                <Label htmlFor="peak-period-label" className="text-xs">
                  Label (optional)
                </Label>
                <Input
                  id="peak-period-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Summer peak"
                  className="h-8 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            </div>
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={2}
              defaultMonth={range?.from}
            />
            <div className="flex justify-end gap-2 p-3 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!range?.from || upsert.isPending}
                onClick={() => void handleAdd()}
              >
                {upsert.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarIcon className="mr-1.5 h-4 w-4" />
                )}
                Save range
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading peak dates…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No peak date ranges defined.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs">Label</TableHead>
              <TableHead className="text-xs">Dates</TableHead>
              <TableHead className="w-[72px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const start = row.start_date;
              const end = row.end_date;
              const dateLabel =
                start && end
                  ? formatPeakPeriodRange(start, end)
                  : "—";
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-sm py-2">{row.label}</TableCell>
                  <TableCell className={cn("text-sm py-2 text-muted-foreground")}>
                    {dateLabel}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deactivate.isPending}
                      aria-label={`Remove ${row.label}`}
                      onClick={() => void deactivate.mutateAsync(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
