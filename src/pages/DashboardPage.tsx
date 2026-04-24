import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useTodaySchedule } from "@/hooks/useTodaySchedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  LogIn,
  LogOut,
  RefreshCw,
  Scissors,
  Sun,
  TreePine,
  Printer,
  Wallet,
} from "lucide-react";

function formatAed(amount: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

function percent(occupied: number, total: number) {
  if (!total) return 0;
  return Math.round((occupied / total) * 100);
}

function occupancyTone(value: number) {
  if (value > 90) return "bg-red-500";
  if (value >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function rowHref(ownerId: string, petId: string | null) {
  if (!petId) return `/customers/${ownerId}`;
  return `/customers/${ownerId}/pets/${petId}`;
}

const SLOT_TIMES = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [asOf, setAsOf] = useState(todayStr);

  const {
    data: metrics,
    isLoading: metricsLoading,
    isFetching: metricsFetching,
    dataUpdatedAt,
  } = useDashboardMetrics(asOf);
  const { data: schedule, isLoading: scheduleLoading } = useTodaySchedule(asOf);

  const boardPct = percent(
    metrics?.occupancy.boarding_occupied ?? 0,
    metrics?.occupancy.boarding_total_rooms ?? 0,
  );
  const catPct = percent(
    metrics?.occupancy.cattery_occupied ?? 0,
    metrics?.occupancy.cattery_total_rooms ?? 0,
  );

  const allParkRows = useMemo(
    () => [...(schedule?.park ?? []), ...(schedule?.assessments ?? [])],
    [schedule?.assessments, schedule?.park],
  );

  const parkCell = (hour: string, lane: "small" | "big") =>
    allParkRows.find((slot) => slot.slotStart.startsWith(hour) && slot.sizeLane === lane);

  const alerts = [
    {
      key: "overdue",
      count: metrics?.alerts.overdue_invoices_count ?? 0,
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      text: `${metrics?.alerts.overdue_invoices_count ?? 0} overdue invoices`,
      detail: `Total ${formatAed(metrics?.alerts.overdue_invoices_aed ?? 0)}`,
      href: "/billing/invoices?status=overdue",
    },
    {
      key: "outstanding",
      count: metrics?.alerts.outstanding_invoices_count ?? 0,
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      text: `${metrics?.alerts.outstanding_invoices_count ?? 0} outstanding invoices`,
      detail: `Total ${formatAed(metrics?.alerts.outstanding_invoices_aed ?? 0)}`,
      href: "/billing/invoices?status=outstanding,overdue",
    },
    {
      key: "wallet",
      count: metrics?.alerts.low_wallet_members ?? 0,
      icon: <Wallet className="h-4 w-4 text-amber-500" />,
      text: `${metrics?.alerts.low_wallet_members ?? 0} members with low wallet balance`,
      detail: "Review members requiring top-up",
      href: "/customers?filter=low-wallet",
    },
    {
      key: "assessment",
      count: metrics?.alerts.pets_unassessed ?? 0,
      icon: <ClipboardCheck className="h-4 w-4 text-blue-500" />,
      text: `${metrics?.alerts.pets_unassessed ?? 0} pets awaiting assessment`,
      detail: "Assessment still pending",
      href: "/customers?filter=unassessed",
    },
    {
      key: "vax-expired",
      count: metrics?.alerts.vaccinations_expired ?? 0,
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      text: `${metrics?.alerts.vaccinations_expired ?? 0} expired vaccinations`,
      detail: "Needs immediate follow-up",
      href: "/customers?filter=vax-expired",
    },
    {
      key: "vax-expiring",
      count: metrics?.alerts.vaccinations_expiring_30d ?? 0,
      icon: <CalendarClock className="h-4 w-4 text-amber-500" />,
      text: `${metrics?.alerts.vaccinations_expiring_30d ?? 0} vaccinations expiring in 30 days`,
      detail: "Contact owners proactively",
      href: "/customers?filter=vax-expiring",
    },
  ].filter((row) => row.count > 0);

  const activityTiles = [
    {
      label: "Check-ins",
      value: metrics?.today.check_ins ?? 0,
      icon: LogIn,
      href: `/boarding?date=${asOf}&view=check-ins`,
    },
    {
      label: "Check-outs",
      value: metrics?.today.check_outs ?? 0,
      icon: LogOut,
      href: `/boarding?date=${asOf}&view=check-outs`,
    },
    {
      label: "Daycare today",
      value: metrics?.today.daycare_attending ?? 0,
      icon: Sun,
      href: "/daycare?tab=operations",
    },
    {
      label: "Park bookings",
      value: metrics?.today.park_bookings ?? 0,
      icon: TreePine,
      href: `/park?date=${asOf}`,
    },
    {
      label: "Grooming",
      value: metrics?.today.grooming_appointments ?? 0,
      icon: Scissors,
      href: `/grooming?date=${asOf}`,
    },
    {
      label: "Assessments",
      value: metrics?.today.assessments_scheduled ?? 0,
      icon: ClipboardCheck,
      href: `/park?date=${asOf}&type=assessment`,
    },
  ];

  const lastRefreshed = dataUpdatedAt ? format(new Date(dataUpdatedAt), "d MMM, h:mm:ss a") : "—";
  const isLoading = metricsLoading || scheduleLoading;

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-medium">Staff Operations Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              {metrics?.as_of ? `As of ${format(parseISO(metrics.as_of), "EEEE, d MMM yyyy")}` : "Operations snapshot"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(
                  `/print/kennel-cards?date=${asOf}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Print kennel cards
            </Button>
            <Button
              type="button"
              variant={asOf === todayStr ? "default" : "outline"}
              onClick={() => setAsOf(todayStr)}
            >
              Today
            </Button>
            <Input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-[170px]"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-12"><CardContent className="p-4"><Skeleton className="h-28 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-44 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-44 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-12">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s activity</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {activityTiles.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <Link
                      key={tile.label}
                      to={tile.href}
                      className="rounded-md border p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                        <span className="text-xs">{tile.label}</span>
                      </div>
                      <p className="text-2xl font-medium tabular-nums">{tile.value}</p>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="md:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Boarding</span>
                    <span className="tabular-nums text-muted-foreground">
                      {metrics?.occupancy.boarding_occupied}/{metrics?.occupancy.boarding_total_rooms} ({boardPct}%)
                    </span>
                  </div>
                  <Progress
                    value={boardPct}
                    className="h-2"
                    indicatorClassName={occupancyTone(boardPct)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Cattery</span>
                    <span className="tabular-nums text-muted-foreground">
                      {metrics?.occupancy.cattery_occupied}/{metrics?.occupancy.cattery_total_rooms} ({catPct}%)
                    </span>
                  </div>
                  <Progress
                    value={catPct}
                    className="h-2"
                    indicatorClassName={occupancyTone(catPct)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Rooms checking out today</p>
                  {(schedule?.check_outs.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No check-outs today</p>
                  ) : (
                    <div className="space-y-1">
                      {schedule?.check_outs.slice(0, 3).map((row) => (
                        <p key={row.bookingId} className="text-sm">
                          {row.roomNumber ?? "Room —"} · {row.petName}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active alerts for this date.</p>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((row) => (
                      <div key={row.key} className="flex items-start justify-between gap-3 rounded-md border p-2.5">
                        <div className="flex items-start gap-2">
                          {row.icon}
                          <div>
                            <p className="text-sm">{row.text}</p>
                            <p className="text-xs text-muted-foreground">{row.detail}</p>
                          </div>
                        </div>
                        <Link className="text-xs text-primary hover:underline" to={row.href}>
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s check-ins</CardTitle>
              </CardHeader>
              <CardContent>
                {(schedule?.check_ins.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-ins today.</p>
                ) : (
                  <div className="space-y-1">
                    {schedule?.check_ins.slice(0, 8).map((row) => (
                      <Link
                        key={row.bookingId}
                        to={rowHref(row.ownerId, row.petId)}
                        className="block rounded-md px-2 py-1.5 hover:bg-muted/40"
                      >
                        <p className="text-sm">{row.petName}</p>
                        <p className="text-xs text-muted-foreground">{row.ownerName} · {row.roomNumber ?? "No room"}</p>
                      </Link>
                    ))}
                    {(schedule?.check_ins.length ?? 0) > 8 && (
                      <Link className="text-xs text-primary hover:underline" to={`/boarding?date=${asOf}&view=check-ins`}>
                        + {(schedule?.check_ins.length ?? 0) - 8} more
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s check-outs</CardTitle>
              </CardHeader>
              <CardContent>
                {(schedule?.check_outs.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-outs today.</p>
                ) : (
                  <div className="space-y-1">
                    {schedule?.check_outs.slice(0, 8).map((row) => (
                      <Link
                        key={row.bookingId}
                        to={rowHref(row.ownerId, row.petId)}
                        className="block rounded-md px-2 py-1.5 hover:bg-muted/40"
                      >
                        <p className="text-sm">{row.petName}</p>
                        <p className="text-xs text-muted-foreground">{row.ownerName} · {row.roomNumber ?? "No room"}</p>
                      </Link>
                    ))}
                    {(schedule?.check_outs.length ?? 0) > 8 && (
                      <Link className="text-xs text-primary hover:underline" to={`/boarding?date=${asOf}&view=check-outs`}>
                        + {(schedule?.check_outs.length ?? 0) - 8} more
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s grooming</CardTitle>
              </CardHeader>
              <CardContent>
                {(schedule?.grooming.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No grooming appointments today.</p>
                ) : (
                  <div className="space-y-1">
                    {schedule?.grooming.slice(0, 8).map((row) => (
                      <Link
                        key={row.bookingId}
                        to={rowHref(row.ownerId, row.petId)}
                        className="block rounded-md px-2 py-1.5 hover:bg-muted/40"
                      >
                        <p className="text-sm">{row.petName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.ownerName} · {row.time?.slice(0, 5) ?? "Time —"}
                        </p>
                      </Link>
                    ))}
                    {(schedule?.grooming.length ?? 0) > 8 && (
                      <Link className="text-xs text-primary hover:underline" to={`/grooming?date=${asOf}`}>
                        + {(schedule?.grooming.length ?? 0) - 8} more
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s park & assessments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-1 text-xs text-muted-foreground">
                  <span />
                  <span className="text-center">Small</span>
                  <span className="text-center">Big</span>
                </div>
                <div className="mt-1 space-y-1">
                  {SLOT_TIMES.map((hour) => {
                    const small = parkCell(hour, "small");
                    const big = parkCell(hour, "big");
                    return (
                      <div key={hour} className="grid grid-cols-[72px_1fr_1fr] items-center gap-1">
                        <span className="text-xs text-muted-foreground">{hour}</span>
                        {[small, big].map((cell, idx) => (
                          <div
                            key={`${hour}-${idx}`}
                            className={[
                              "min-h-9 rounded-md border px-2 py-1 text-xs",
                              cell ? "bg-muted/20" : "text-muted-foreground",
                              cell?.isAssessment ? "border-amber-400" : "",
                            ].join(" ")}
                          >
                            {cell ? `${cell.petName} · ${cell.ownerInitials}` : "—"}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Financial 7d</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Invoiced</span>
                  <span className="tabular-nums">{formatAed(metrics?.financial_7d.invoiced ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="tabular-nums">{formatAed(metrics?.financial_7d.collected ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Net revenue</span>
                  <span className="tabular-nums">
                    {formatAed((metrics?.financial_7d.collected ?? 0) - (metrics?.financial_7d.refunded ?? 0))}
                  </span>
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  Last 7 days including today. For detailed reporting, use Billing → Invoices.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>Last refreshed: {lastRefreshed}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
              void queryClient.invalidateQueries({ queryKey: ["today-schedule"] });
            }}
            disabled={metricsFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${metricsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
