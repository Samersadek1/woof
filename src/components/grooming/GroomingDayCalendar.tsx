import { format, parse } from "date-fns";
import { useMemo } from "react";

import type { GroomingAppointmentWithJoins } from "@/hooks/useGrooming";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import {
  buildGroomingDayCalendarModel,
  GROOMING_CALENDAR_ROW_HEIGHT_PX,
  groomingBlockStatusClass,
  groomingCalendarColumnKey,
} from "@/lib/groomingCalendarModel";
import { workflowStatusLabel } from "@/lib/groomingWorkflow";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { TriangleAlert } from "lucide-react";

type Props = {
  appointments: GroomingAppointmentWithJoins[];
  isLoading?: boolean;
  onAppointmentClick: (row: GroomingAppointmentWithJoins) => void;
};

function formatApptTime(t: string | null): string {
  if (!t) return "—";
  const slice = t.length >= 8 ? t.slice(0, 8) : `${t}:00`.slice(0, 8);
  try {
    const base = parse(slice, "HH:mm:ss", new Date(2000, 0, 1));
    return format(base, "h:mm a");
  } catch {
    return t;
  }
}

function groomerLabel(a: GroomingAppointmentWithJoins): string | null {
  const name = a.grooming_notes?.trim();
  return name || null;
}

export function GroomingDayCalendar({
  appointments,
  isLoading,
  onAppointmentClick,
}: Props) {
  const model = useMemo(
    () => buildGroomingDayCalendarModel({ appointments }),
    [appointments],
  );

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="grooming-day-calendar">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  const unscheduledRows = model.columns.some(
    (col) => (model.unscheduledByColumn.get(groomingCalendarColumnKey(col)) ?? []).length > 0,
  );

  return (
    <div
      className="rounded-lg border border-border overflow-hidden bg-card"
      data-testid="grooming-day-calendar"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          <div
            className="grid border-b border-border bg-muted/40 text-sm font-medium"
            style={{
              gridTemplateColumns: `4.5rem repeat(${model.columns.length}, minmax(10rem, 1fr))`,
            }}
          >
            <div className="px-2 py-2 text-xs text-muted-foreground">Time</div>
            {model.columns.map((col) => (
              <div
                key={groomingCalendarColumnKey(col)}
                className="border-l border-border px-2 py-2 truncate"
                data-testid={`grooming-calendar-station-${col.station}`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {unscheduledRows ? (
            <div
              className="grid border-b border-border bg-amber-50/60"
              style={{
                gridTemplateColumns: `4.5rem repeat(${model.columns.length}, minmax(10rem, 1fr))`,
              }}
            >
              <div className="px-2 py-2 text-xs font-medium text-amber-900">No time</div>
              {model.columns.map((col) => {
                const key = groomingCalendarColumnKey(col);
                const list = model.unscheduledByColumn.get(key) ?? [];
                return (
                  <div key={`unsched-${key}`} className="border-l border-border p-1 space-y-1">
                    {list.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={cn(
                          "w-full rounded border px-2 py-1 text-left text-xs transition-colors hover:opacity-90",
                          groomingBlockStatusClass(a.status),
                        )}
                        onClick={() => onAppointmentClick(a)}
                      >
                        <span className="font-semibold block truncate">
                          {a.pets?.name ?? "Pet"}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {labelForGroomingService(a.service)}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div
            className="grid"
            style={{
              gridTemplateColumns: `4.5rem repeat(${model.columns.length}, minmax(10rem, 1fr))`,
            }}
          >
            <div className="relative border-r border-border bg-muted/20">
              {model.slotLabels.map((label, index) => (
                <div
                  key={label}
                  className="border-b border-border/60 px-2 text-[10px] text-muted-foreground flex items-start pt-1"
                  style={{ height: GROOMING_CALENDAR_ROW_HEIGHT_PX }}
                >
                  {index % 2 === 0 ? label : null}
                </div>
              ))}
            </div>

            {model.columns.map((col) => {
              const columnKey = groomingCalendarColumnKey(col);
              const blocks = model.timedBlocks.filter((b) => b.columnKey === columnKey);

              return (
                <div
                  key={columnKey}
                  className="relative border-l border-border"
                  style={{ height: model.totalHeightPx }}
                >
                  {model.slotLabels.map((label) => (
                    <div
                      key={`${columnKey}-${label}`}
                      className="border-b border-border/40"
                      style={{ height: GROOMING_CALENDAR_ROW_HEIGHT_PX }}
                    />
                  ))}

                  {blocks.map((block) => {
                    const a = block.appointment;
                    const ownerName = a.owners
                      ? ownerDisplayName(a.owners.first_name, a.owners.last_name)
                      : "";
                    const widthPct = 100 / block.laneCount;
                    const leftPct = block.lane * widthPct;
                    const groomer = groomerLabel(a);

                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={cn(
                          "absolute z-10 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md",
                          groomingBlockStatusClass(a.status),
                          block.hasConflict && "ring-2 ring-destructive ring-offset-1",
                        )}
                        style={{
                          top: block.topPx,
                          height: block.heightPx,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        onClick={() => onAppointmentClick(a)}
                      >
                        <span className="font-semibold block truncate">
                          {formatApptTime(a.appointment_time)} · {a.pets?.name ?? "Pet"}
                        </span>
                        <span className="block truncate opacity-90">
                          {ownerName || "—"}
                        </span>
                        <span className="block truncate text-[10px] opacity-75">
                          {labelForGroomingService(a.service)}
                          {groomer ? ` · ${groomer}` : ""} · {workflowStatusLabel(a.status)}
                        </span>
                        {block.hasConflict ? (
                          <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium text-destructive">
                            <TriangleAlert className="h-3 w-3 shrink-0" />
                            Overlap
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
