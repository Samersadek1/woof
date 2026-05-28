import { useState } from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { Link } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useTodaySchedule } from "@/hooks/useTodaySchedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { invoiceDisplayTotals } from "@/lib/vatConfig";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  LogIn,
  LogOut,
  Minus,
  RefreshCw,
  Scissors,
  Sun,
  TrendingDown,
  TrendingUp,
  Printer,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type InvSumRow = {
  total: number;
  total_aed: number | null;
  vat_aed: number | null;
  service_type: string | null;
  notes?: string | null;
};
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

function invoiceGrand(r: InvSumRow) {
  return invoiceDisplayTotals({
    total: r.total,
    total_aed: r.total_aed,
    vat_aed: r.vat_aed,
    service_type: r.service_type,
    notes: r.notes,
  }).grandTotal;
}

async function sumPaidFinalWindow(
  paidStart: Date,
  paidEnd: Date,
  issueStartStr: string,
  issueEndStr: string,
): Promise<number> {
  const [paidRes, finRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("total, total_aed, vat_aed, service_type, notes")
      .eq("status", "paid")
      .gte("paid_at", paidStart.toISOString())
      .lte("paid_at", paidEnd.toISOString()),
    supabase
      .from("invoices")
      .select("total, total_aed, vat_aed, service_type, notes")
      .eq("status", "finalised")
      .gte("issue_date", issueStartStr)
      .lte("issue_date", issueEndStr),
  ]);
  if (paidRes.error) throw paidRes.error;
  if (finRes.error) throw finRes.error;
  let s = 0;
  for (const r of paidRes.data ?? []) s += invoiceGrand(r);
  for (const r of finRes.data ?? []) s += invoiceGrand(r);
  return s;
}

type TrendKind = "up" | "down" | "flat";

function trendFromDelta(current: number, previous: number): { kind: TrendKind; label: string } {
  if (previous <= 0 && current <= 0) return { kind: "flat", label: "vs prior period" };
  if (previous <= 0) return { kind: "up", label: "vs prior — new" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { kind: "flat", label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs prior` };
  if (pct > 0) return { kind: "up", label: `+${pct.toFixed(0)}% vs prior` };
  return { kind: "down", label: `${pct.toFixed(0)}% vs prior` };
}

const OTHER_GROOMING = new Set(["nail_clip", "deshedding", "brushing", "pawdicure"]);

type DashboardInsights = {
  revenue: {
    today: number;
    todayTrend: { kind: TrendKind; label: string };
    week: number;
    weekTrend: { kind: TrendKind; label: string };
    month: number;
    monthTrend: { kind: TrendKind; label: string };
  };
  serviceChart: { name: string; count: number }[];
  topClients: { ownerId: string; name: string; visits: number; spentAed: number }[];
  quickStats: {
    activeBoardings: number;
    groomingToday: number;
    daycareToday: number;
    overdueInvoices: number;
  };
};

async function loadDashboardInsights(now: Date): Promise<DashboardInsights> {
  const todayStr = format(now, "yyyy-MM-dd");
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const yStart = startOfDay(subDays(now, 1));
  const yEnd = endOfDay(subDays(now, 1));
  const yStr = format(subDays(now, 1), "yyyy-MM-dd");

  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subDays(thisWeekStart, 7), { weekStartsOn: 1 });
  const prevWeekEnd = endOfWeek(subDays(thisWeekStart, 7), { weekStartsOn: 1 });

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  const [
    todayRev,
    yRev,
    weekRev,
    prevWeekRev,
    monthRev,
    prevMonthRev,
    groomingRows,
    boardingCount,
    daycareCount,
    paidMonthByOwner,
    finMonthByOwner,
    activeBoardings,
    groomingToday,
    daycareToday,
    overdueInvoices,
  ] = await Promise.all([
    sumPaidFinalWindow(dayStart, dayEnd, todayStr, todayStr),
    sumPaidFinalWindow(yStart, yEnd, yStr, yStr),
    sumPaidFinalWindow(thisWeekStart, thisWeekEnd, fmt(thisWeekStart), fmt(thisWeekEnd)),
    sumPaidFinalWindow(prevWeekStart, prevWeekEnd, fmt(prevWeekStart), fmt(prevWeekEnd)),
    sumPaidFinalWindow(monthStart, monthEnd, fmt(monthStart), fmt(monthEnd)),
    sumPaidFinalWindow(prevMonthStart, prevMonthEnd, fmt(prevMonthStart), fmt(prevMonthEnd)),
    supabase
      .from("grooming_appointments")
      .select("service, owner_id")
      .gte("appointment_date", fmt(monthStart))
      .lte("appointment_date", fmt(monthEnd))
      .or("no_show.eq.false,no_show.is.null"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("booking_type", "boarding")
      .neq("status", "cancelled")
      .gte("check_in_date", fmt(monthStart))
      .lte("check_in_date", fmt(monthEnd)),
    supabase
      .from("daycare_sessions")
      .select("id", { count: "exact", head: true })
      .gte("session_date", fmt(monthStart))
      .lte("session_date", fmt(monthEnd)),
    supabase
      .from("invoices")
      .select("owner_id, total, total_aed, vat_aed, service_type, notes")
      .eq("status", "paid")
      .gte("paid_at", monthStart.toISOString())
      .lte("paid_at", monthEnd.toISOString()),
    supabase
      .from("invoices")
      .select("owner_id, total, total_aed, vat_aed, service_type, notes")
      .eq("status", "finalised")
      .gte("issue_date", fmt(monthStart))
      .lte("issue_date", fmt(monthEnd)),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("booking_type", "boarding")
      .eq("status", "checked_in"),
    supabase
      .from("grooming_appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", todayStr)
      .or("no_show.eq.false,no_show.is.null"),
    supabase
      .from("daycare_sessions")
      .select("id", { count: "exact", head: true })
      .eq("session_date", todayStr),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "overdue"),
  ]);

  if (groomingRows.error) throw groomingRows.error;
  if (boardingCount.error) throw boardingCount.error;
  if (daycareCount.error) throw daycareCount.error;
  if (paidMonthByOwner.error) throw paidMonthByOwner.error;
  if (finMonthByOwner.error) throw finMonthByOwner.error;
  if (activeBoardings.error) throw activeBoardings.error;
  if (groomingToday.error) throw groomingToday.error;
  if (daycareToday.error) throw daycareToday.error;
  if (overdueInvoices.error) throw overdueInvoices.error;

  let fullGroom = 0;
  let bathOnly = 0;
  let otherGroom = 0;
  const visitByOwner = new Map<string, number>();

  for (const row of groomingRows.data ?? []) {
    const svc = row.service as string;
    if (svc === "full_groom") fullGroom += 1;
    else if (svc === "full_bath") bathOnly += 1;
    else if (OTHER_GROOMING.has(svc)) otherGroom += 1;
    else otherGroom += 1;
    if (row.owner_id) visitByOwner.set(row.owner_id, (visitByOwner.get(row.owner_id) ?? 0) + 1);
  }

  const { data: boardOwners, error: boErr } = await supabase
    .from("bookings")
    .select("owner_id")
    .eq("booking_type", "boarding")
    .neq("status", "cancelled")
    .gte("check_in_date", fmt(monthStart))
    .lte("check_in_date", fmt(monthEnd));
  if (boErr) throw boErr;
  for (const r of boardOwners ?? []) {
    if (r.owner_id) visitByOwner.set(r.owner_id, (visitByOwner.get(r.owner_id) ?? 0) + 1);
  }

  const { data: dcOwners, error: dcErr } = await supabase
    .from("daycare_sessions")
    .select("owner_id")
    .gte("session_date", fmt(monthStart))
    .lte("session_date", fmt(monthEnd));
  if (dcErr) throw dcErr;
  for (const r of dcOwners ?? []) {
    visitByOwner.set(r.owner_id, (visitByOwner.get(r.owner_id) ?? 0) + 1);
  }

  const spentByOwner = new Map<string, number>();
  for (const r of paidMonthByOwner.data ?? []) {
    const g = invoiceGrand(r);
    spentByOwner.set(r.owner_id, (spentByOwner.get(r.owner_id) ?? 0) + g);
  }
  for (const r of finMonthByOwner.data ?? []) {
    const g = invoiceGrand(r);
    spentByOwner.set(r.owner_id, (spentByOwner.get(r.owner_id) ?? 0) + g);
  }

  const ownerIds = Array.from(
    new Set([...visitByOwner.keys(), ...spentByOwner.keys()]),
  ).filter(Boolean);
  const ranked = ownerIds
    .map((id) => ({
      ownerId: id,
      name: "",
      visits: visitByOwner.get(id) ?? 0,
      spentAed: spentByOwner.get(id) ?? 0,
    }))
    .sort((a, b) => b.visits - a.visits || b.spentAed - a.spentAed)
    .slice(0, 5);

  if (ranked.length > 0) {
    const { data: owners, error: ownErr } = await supabase
      .from("owners")
      .select("id, first_name, last_name")
      .in(
        "id",
        ranked.map((r) => r.ownerId),
      );
    if (ownErr) throw ownErr;
    const nameMap = new Map(
      (owners ?? []).map((o) => [
        o.id,
        ownerDisplayName(o.first_name, o.last_name),
      ]),
    );
    for (const r of ranked) {
      r.name = nameMap.get(r.ownerId) ?? "Unknown";
    }
  }

  const chartRaw = [
    { name: "Full groom", count: fullGroom },
    { name: "Bath only", count: bathOnly },
    { name: "Boarding", count: boardingCount.count ?? 0 },
    { name: "Daycare", count: daycareCount.count ?? 0 },
    { name: "Other grooming", count: otherGroom },
  ];
  const serviceChart = [...chartRaw].sort((a, b) => b.count - a.count);

  return {
    revenue: {
      today: todayRev,
      todayTrend: trendFromDelta(todayRev, yRev),
      week: weekRev,
      weekTrend: trendFromDelta(weekRev, prevWeekRev),
      month: monthRev,
      monthTrend: trendFromDelta(monthRev, prevMonthRev),
    },
    serviceChart,
    topClients: ranked,
    quickStats: {
      activeBoardings: activeBoardings.count ?? 0,
      groomingToday: groomingToday.count ?? 0,
      daycareToday: daycareToday.count ?? 0,
      overdueInvoices: overdueInvoices.count ?? 0,
    },
  };
}

function TrendGlyph({ kind }: { kind: TrendKind }) {
  if (kind === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (kind === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-600" aria-hidden />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

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
  const { data: insights, isLoading: insightsLoading, isFetching: insightsFetching } = useQuery({
    queryKey: ["dashboard-insights", format(new Date(), "yyyy-MM-dd")],
    queryFn: () => loadDashboardInsights(new Date()),
    staleTime: 60_000,
  });
  const { data: dueTodayOverdue = [], isLoading: dueTodayLoading } = useQuery({
    queryKey: ["dashboard-due-today-overdue", asOf],
    queryFn: async () => {
      const UNPAID: InvoiceStatus[] = [
        "draft",
        "issued",
        "finalised",
        "outstanding",
        "overdue",
        "partially_paid",
      ];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, owner_id, total, total_aed, vat_aed, service_type, notes, amount_paid, due_date, status, owners(first_name, last_name)")
        .eq("due_date", asOf)
        .in("status", UNPAID)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const grouped = new Map<string, { ownerId: string; ownerName: string; balance: number }>();
      for (const inv of data ?? []) {
        const grand = invoiceDisplayTotals({
          total: inv.total,
          total_aed: inv.total_aed,
          vat_aed: inv.vat_aed,
          service_type: inv.service_type,
          notes: inv.notes,
        }).grandTotal;
        const paid = inv.amount_paid ?? 0;
        const outstanding = Math.max(0, grand - paid);
        if (outstanding <= 0) continue;
        const ownerId = inv.owner_id ?? "unknown";
        const ownerName = ownerDisplayName(
          inv.owners?.first_name ?? null,
          inv.owners?.last_name ?? null,
        );
        const existing = grouped.get(ownerId);
        if (existing) existing.balance += outstanding;
        else grouped.set(ownerId, { ownerId, ownerName, balance: outstanding });
      }

      return Array.from(grouped.values()).sort((a, b) => b.balance - a.balance);
    },
  });

  const boardPct = percent(
    metrics?.occupancy.boarding_occupied ?? 0,
    metrics?.occupancy.boarding_total_rooms ?? 0,
  );
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
  const dueTodayCount = dueTodayOverdue.length;
  const dueTodayTotal = dueTodayOverdue.reduce((sum, row) => sum + row.balance, 0);

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
      label: "Grooming",
      value: metrics?.today.grooming_appointments ?? 0,
      icon: Scissors,
      href: `/grooming?date=${asOf}`,
    },
  ];

  const lastRefreshed = dataUpdatedAt ? format(new Date(dataUpdatedAt), "d MMM, h:mm:ss a") : "—";
  const isLoading = metricsLoading || scheduleLoading;
  const insightsChartData = insights ? [...insights.serviceChart].reverse() : [];

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
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

        {insightsLoading || !insights ? (
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-14 w-full" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-7">
                <CardContent className="p-4">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
              <Card className="lg:col-span-5">
                <CardContent className="p-4">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Today&apos;s revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums">{formatAed(insights.revenue.today)}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendGlyph kind={insights.revenue.todayTrend.kind} />
                    <span>{insights.revenue.todayTrend.label}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    This week&apos;s revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums">{formatAed(insights.revenue.week)}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendGlyph kind={insights.revenue.weekTrend.kind} />
                    <span>{insights.revenue.weekTrend.label}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    This month&apos;s revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums">{formatAed(insights.revenue.month)}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendGlyph kind={insights.revenue.monthTrend.kind} />
                    <span>{insights.revenue.monthTrend.label}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick stats (today)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Calendar today · Boarding = checked-in stays
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Active boardings</p>
                  <p className="text-xl font-semibold tabular-nums">{insights.quickStats.activeBoardings}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Grooming appts</p>
                  <p className="text-xl font-semibold tabular-nums">{insights.quickStats.groomingToday}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Daycare sessions</p>
                  <p className="text-xl font-semibold tabular-nums">{insights.quickStats.daycareToday}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Overdue invoices</p>
                  <p className="text-xl font-semibold tabular-nums text-red-600">
                    {insights.quickStats.overdueInvoices}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top services this month</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Booking counts for {format(startOfMonth(new Date()), "d MMM")} –{" "}
                    {format(endOfMonth(new Date()), "d MMM yyyy")} (sorted high → low)
                  </p>
                </CardHeader>
                <CardContent className="h-[280px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={insightsChartData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={118}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v} bookings`, "Count"]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top clients this month</CardTitle>
                  <p className="text-xs text-muted-foreground">By visit count, then amount spent (paid &amp; finalised)</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.topClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet this month.</p>
                  ) : (
                    insights.topClients.map((c, idx) => (
                      <Link
                        key={c.ownerId}
                        to={`/customers/${c.ownerId}`}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            <span className="text-muted-foreground tabular-nums mr-2">{idx + 1}.</span>
                            {c.name}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {c.visits} visit{c.visits === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatAed(c.spentAed)}
                        </span>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-12"><CardContent className="p-4"><Skeleton className="h-28 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-44 w-full" /></CardContent></Card>
            <Card className="md:col-span-6"><CardContent className="p-4"><Skeleton className="h-44 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-4"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
            <Card className="md:col-span-12"><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-12">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today&apos;s activity</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  {(metrics?.occupancy.boarding_unassigned_guests ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {metrics?.occupancy.boarding_rooms_occupied ?? 0} rooms ·{" "}
                      {metrics?.occupancy.boarding_unassigned_guests} unassigned
                    </p>
                  )}
                  <Progress
                    value={boardPct}
                    className="h-2"
                    indicatorClassName={occupancyTone(boardPct)}
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

            <Card className="md:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Overdue Payments Due Today</CardTitle>
              </CardHeader>
              <CardContent>
                {dueTodayLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : dueTodayCount === 0 ? (
                  <p className="text-sm text-muted-foreground">No due-today outstanding balances.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      {dueTodayCount} client{dueTodayCount === 1 ? "" : "s"} due today · Total {formatAed(dueTodayTotal)}
                    </div>
                    {dueTodayOverdue.slice(0, 8).map((row) => (
                      <Link
                        key={row.ownerId}
                        to={`/billing/${row.ownerId}?tab=invoices`}
                        className="flex items-center justify-between rounded-md border px-2.5 py-2 hover:bg-muted/40"
                      >
                        <span className="text-sm">{row.ownerName}</span>
                        <span className="text-sm font-medium tabular-nums">
                          {formatAed(row.balance)}
                        </span>
                      </Link>
                    ))}
                    {dueTodayCount > 8 && (
                      <Link className="text-xs text-primary hover:underline" to="/billing/invoices?status=overdue">
                        + {dueTodayCount - 8} more
                      </Link>
                    )}
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

            <Card className="md:col-span-12">
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
              void queryClient.invalidateQueries({ queryKey: ["dashboard-insights"] });
            }}
            disabled={metricsFetching || insightsFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${metricsFetching || insightsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
