import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useTopUpWallet } from "@/hooks/useWallet";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// ── types ────────────────────────────────────────────────────────────────────

interface VaxAlert {
  petName: string;
  ownerId: string;
  ownerLastName: string;
  vaccineName: string;
  daysLeft: number;
}

interface PaymentRow {
  id: string;
  invoiceNumber: string | null;
  serviceType: string | null;
  total: number;
  ownerLastName: string;
  ownerId: string;
  daysOverdue?: number;
}

interface TopupRow {
  ownerId: string;
  ownerName: string;
  walletBalance: number;
  requestId: string | null;
  amountRequested: number | null;
  daysPending: number | null;
  requestStatus: string | null;
}

interface DashboardData {
  overdueCheckins: number;
  expiringVax: number;
  pendingTopups: number;
  overdueInvoiceTotal: number;
  dogsBoarding: number;
  catsBoarding: number;
  daycareToday: number;
  parkToday: number;
  groomingToday: number;
  vaxAlerts: VaxAlert[];
  paymentsDue: PaymentRow[];
  paymentsOverdue: PaymentRow[];
  topupRequests: TopupRow[];
  lowBalanceCount: number;
  lowBalanceThreshold: number;
}

const DOG_ROOM_CAPACITY = 57;
const CAT_ROOM_CAPACITY = 25;

function formatAed(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── data loader ──────────────────────────────────────────────────────────────

async function fetchDashboardData(): Promise<DashboardData> {
  const today = new Date().toISOString().split("T")[0];
  const pastNoon = new Date().getHours() >= 12;

  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekEnd = weekFromNow.toISOString().split("T")[0];

  const monthFromNow = new Date();
  monthFromNow.setDate(monthFromNow.getDate() + 30);
  const monthEnd = monthFromNow.toISOString().split("T")[0];

  const [
    dogsRes,
    catsRes,
    daycareRes,
    parkRes,
    groomingRes,
    overdueTodayRes,
    vaxWeekRes,
    vaxMonthRes,
    paymentsDueRes,
    paymentsOverdueRes,
    pendingTopupsRes,
    overdueInvoiceTotalRes,
    thresholdRes,
    lowBalanceRes,
    topupRequestsRes,
  ] = await Promise.all([
    // Dogs boarding
    supabase
      .from("bookings")
      .select("id, rooms!inner(wing)")
      .eq("status", "checked_in")
      .neq("rooms.wing", "cattery"),
    // Cats boarding
    supabase
      .from("bookings")
      .select("id, rooms!inner(wing)")
      .eq("status", "checked_in")
      .eq("rooms.wing", "cattery"),
    // Daycare today
    supabase
      .from("daycare_sessions")
      .select("id")
      .eq("session_date", today)
      .eq("checked_in", true),
    // Park bookings today
    supabase
      .from("park_bookings")
      .select("id")
      .eq("visit_date", today),
    // Grooming today
    supabase
      .from("grooming_appointments")
      .select("id")
      .eq("appointment_date", today)
      .neq("status", "cancelled"),
    // Today's check-ins (minimal) — only for overdue pill (confirmed + past noon)
    supabase
      .from("bookings")
      .select("id, status")
      .eq("check_in_date", today)
      .in("status", ["confirmed", "checked_in"]),
    // Vax expiring this week (for pill count)
    supabase
      .from("vaccinations")
      .select("id")
      .gte("expiry_date", today)
      .lte("expiry_date", weekEnd),
    // Vax expiring within 30 days (for detail list)
    supabase
      .from("vaccinations")
      .select("vaccine_name, expiry_date, pets!inner(name, owner_id, owners!inner(id, first_name, last_name))")
      .gte("expiry_date", today)
      .lte("expiry_date", monthEnd)
      .order("expiry_date", { ascending: true })
      .limit(8),
    // Payments due today
    supabase
      .from("invoices")
      .select("id, invoice_number, service_type, total, owners!inner(id, last_name)")
      .eq("due_date", today)
      .in("status", ["finalised", "issued", "outstanding"])
      .order("total", { ascending: false }),
    // Payments overdue
    supabase
      .from("invoices")
      .select("id, invoice_number, service_type, total, due_date, owners!inner(id, last_name)")
      .lt("due_date", today)
      .in("status", ["outstanding", "overdue", "finalised", "issued"])
      .order("due_date", { ascending: true })
      .limit(8),
    // Pending topup count
    supabase
      .from("wallet_topup_requests")
      .select("id")
      .eq("status", "pending"),
    // Overdue invoice total
    supabase
      .from("invoices")
      .select("total")
      .lt("due_date", today)
      .in("status", ["outstanding", "overdue", "finalised", "issued"]),
    // Low balance threshold from pricing
    supabase
      .from("pricing")
      .select("amount_aed")
      .eq("key", "rule_low_balance_alert_aed")
      .maybeSingle(),
    // Low balance owners count (use a generous threshold to count, refine client-side)
    supabase
      .from("owners")
      .select("id, first_name, last_name, wallet_balance, low_balance_threshold_override")
      .lt("wallet_balance", 50000)
      .order("wallet_balance", { ascending: true }),
    // Pending topup requests with owner info
    supabase
      .from("wallet_topup_requests")
      .select("id, owner_id, amount_requested, status, requested_at, owners!inner(first_name, last_name, wallet_balance)")
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
  ]);

  const threshold = thresholdRes.data?.amount_aed ?? 5000;

  const overdueCheckins = (overdueTodayRes.data ?? []).filter(
    (b: { status: string }) => b.status === "confirmed" && pastNoon,
  ).length;

  // Vax alerts
  const vaxAlerts: VaxAlert[] = (vaxMonthRes.data ?? []).map((v: any) => ({
    petName: v.pets?.name ?? "—",
    ownerId: v.pets?.owners?.id ?? "",
    ownerLastName: v.pets?.owners?.last_name ?? "—",
    vaccineName: v.vaccine_name,
    daysLeft: differenceInCalendarDays(parseISO(v.expiry_date), new Date()),
  }));

  // Payments due
  const paymentsDue: PaymentRow[] = (paymentsDueRes.data ?? []).map((i: any) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    serviceType: i.service_type,
    total: i.total,
    ownerLastName: i.owners?.last_name ?? "—",
    ownerId: i.owners?.id ?? "",
  }));

  // Payments overdue
  const paymentsOverdue: PaymentRow[] = (paymentsOverdueRes.data ?? []).map((i: any) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    serviceType: i.service_type,
    total: i.total,
    ownerLastName: i.owners?.last_name ?? "—",
    ownerId: i.owners?.id ?? "",
    daysOverdue: differenceInCalendarDays(new Date(), parseISO(i.due_date)),
  }));

  // Overdue invoice total
  const overdueInvoiceTotal = (overdueInvoiceTotalRes.data ?? []).reduce(
    (sum: number, i: any) => sum + (i.total ?? 0), 0,
  );

  // Low balance owners & topup requests
  const lowBalanceOwners = (lowBalanceRes.data ?? []).filter(
    (o: any) => o.wallet_balance < (o.low_balance_threshold_override ?? threshold),
  );

  const pendingRequests = topupRequestsRes.data ?? [];
  const pendingOwnerIds = new Set(pendingRequests.map((r: any) => r.owner_id));

  const topupRequests: TopupRow[] = [];

  for (const r of pendingRequests) {
    const daysPending = differenceInCalendarDays(new Date(), parseISO(r.requested_at));
    topupRequests.push({
      ownerId: r.owner_id,
      ownerName: `${(r as any).owners?.first_name ?? ""} ${(r as any).owners?.last_name ?? ""}`.trim() || r.owner_id.slice(0, 8),
      walletBalance: (r as any).owners?.wallet_balance ?? 0,
      requestId: r.id,
      amountRequested: r.amount_requested,
      daysPending,
      requestStatus: "pending",
    });
  }

  for (const o of lowBalanceOwners) {
    if (!pendingOwnerIds.has(o.id)) {
      topupRequests.push({
        ownerId: o.id,
        ownerName: `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim(),
        walletBalance: o.wallet_balance ?? 0,
        requestId: null,
        amountRequested: null,
        daysPending: null,
        requestStatus: null,
      });
    }
  }

  return {
    overdueCheckins,
    expiringVax: vaxWeekRes.data?.length ?? 0,
    pendingTopups: pendingTopupsRes.data?.length ?? 0,
    overdueInvoiceTotal,
    dogsBoarding: dogsRes.data?.length ?? 0,
    catsBoarding: catsRes.data?.length ?? 0,
    daycareToday: daycareRes.data?.length ?? 0,
    parkToday: parkRes.data?.length ?? 0,
    groomingToday: groomingRes.data?.length ?? 0,
    vaxAlerts,
    paymentsDue,
    paymentsOverdue,
    topupRequests,
    lowBalanceCount: lowBalanceOwners.length,
    lowBalanceThreshold: threshold,
  };
}

// ── sub-components ───────────────────────────────────────────────────────────

function OccupancyCard({
  label,
  value,
  total,
  showBar,
  onClick,
}: {
  label: string;
  value: number;
  total?: number;
  showBar?: boolean;
  subtitle?: string;
  onClick?: () => void;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`bg-muted/50 rounded-lg p-3 ${interactive ? "cursor-pointer hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-medium mt-1">{value}</div>
      {showBar && total ? (
        <>
          <div className="h-1.5 bg-border rounded-full mt-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-[#639922]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground/70 mt-1">{value} / {total} · {pct}%</div>
        </>
      ) : (
        <div className="text-[11px] text-muted-foreground/70 mt-1">
          {total ? `of ${total} today` : "checked in"}
        </div>
      )}
    </div>
  );
}

function Pill({
  children,
  variant,
  onClick,
}: {
  children: React.ReactNode;
  variant: "red" | "amber" | "purple" | "blue";
  onClick?: () => void;
}) {
  const cls: Record<string, string> = {
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-[#EEEDFE] text-[#3C3489]",
    blue: "bg-blue-50 text-blue-700",
  };
  const shared = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cls[variant]}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={`${shared} cursor-pointer border-0 hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return <span className={shared}>{children}</span>;
}

function Dot({ color }: { color: "green" | "amber" | "red" | "purple" | "gray" }) {
  const cls: Record<string, string> = {
    green: "bg-[#639922]",
    amber: "bg-[#BA7517]",
    red: "bg-[#E24B4A]",
    purple: "bg-[#7F77DD]",
    gray: "bg-border",
  };
  return <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${cls[color]}`} />;
}

function Chip({ children, variant }: { children: React.ReactNode; variant: "green" | "amber" | "red" | "purple" }) {
  const cls: Record<string, string> = {
    green: "bg-[#EAF3DE] text-[#27500A]",
    amber: "bg-[#FAEEDA] text-[#633806]",
    red: "bg-[#FCEBEB] text-[#791F1F]",
    purple: "bg-[#EEEDFE] text-[#3C3489]",
  };
  return <span className={`text-[11px] px-[7px] py-[2px] rounded font-medium whitespace-nowrap ${cls[variant]}`}>{children}</span>;
}

function CardSection({ title, count, children, empty }: { title: string; count?: number; children: React.ReactNode; empty?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3.5">
      <div className="text-[13px] font-medium mb-2.5">
        {title}
        {count !== undefined && <span className="font-normal text-muted-foreground text-xs ml-1">({count})</span>}
      </div>
      {children}
      {empty && (
        <div className="py-6 text-center text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function Row({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`flex items-center gap-1.5 py-[7px] border-b border-border last:border-b-0 text-[13px] ${onClick ? "cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded" : ""} ${className ?? ""}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

const DashboardPage = () => {
  const navigate = useNavigate();
  const topUp = useTopUpWallet();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const d = await fetchDashboardData();
      setData(d);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayFormatted = format(new Date(), "EEEE, d MMMM yyyy — HH:mm");

  const handleRequestTopup = async (ownerId: string, suggestedAmount: number) => {
    const { error } = await supabase.from("wallet_topup_requests").insert({
      owner_id: ownerId,
      amount_requested: suggestedAmount,
      requested_by: "Staff",
      status: "pending",
    });
    if (error) {
      toast.error("Failed to create request: " + error.message);
    } else {
      toast.success("Top-up request created");
      load();
    }
  };

  const handleMarkReceived = async (requestId: string, ownerId: string, amount: number) => {
    try {
      await topUp.mutateAsync({
        owner_id: ownerId,
        amount,
        notes: `Top-up request fulfilled`,
        payment_method: "cash",
      });
      await supabase
        .from("wallet_topup_requests")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", requestId);
      toast.success("Top-up received and wallet credited");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to process top-up");
    }
  };

  const handleRemind = async (requestId: string) => {
    await supabase
      .from("wallet_topup_requests")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", requestId);
    toast.success("Reminder logged — WhatsApp integration coming soon.");
    load();
  };

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-lg font-medium">{greeting}, MSH</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">{todayFormatted}</div>
          </div>
          <div className="text-xs text-muted-foreground/60">Refreshes every 60s</div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-40 rounded-full" />)}</div>
            <div className="grid grid-cols-5 gap-2.5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
            <div className="grid grid-cols-2 gap-3.5">{[1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-lg" />)}</div>
            <div className="grid grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-60 rounded-lg" />)}</div>
          </div>
        ) : data ? (
          <>
            {/* Alert strip */}
            <div className="flex gap-2 flex-wrap mb-5">
              {data.overdueCheckins > 0 && (
                <Pill variant="red" onClick={() => navigate("/dashboard/checkins?service=boarding")}>
                  {data.overdueCheckins} check-in{data.overdueCheckins !== 1 ? "s" : ""} overdue
                </Pill>
              )}
              {data.expiringVax > 0 && (
                <Pill variant="amber" onClick={() => navigate("/customers")}>
                  {data.expiringVax} vaccination{data.expiringVax !== 1 ? "s" : ""} expiring this week
                </Pill>
              )}
              {data.pendingTopups > 0 && (
                <Pill variant="purple" onClick={() => navigate("/billing")}>
                  {data.pendingTopups} top-up request{data.pendingTopups !== 1 ? "s" : ""} pending
                </Pill>
              )}
              {data.overdueInvoiceTotal > 0 && (
                <Pill variant="blue" onClick={() => navigate("/billing")}>
                  {formatAed(data.overdueInvoiceTotal)} overdue invoices
                </Pill>
              )}
            </div>

            {/* Occupancy */}
            <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">Live occupancy</div>
            <div className="grid grid-cols-5 gap-2.5 mb-5">
              <OccupancyCard
                label="Dogs boarding"
                value={data.dogsBoarding}
                total={DOG_ROOM_CAPACITY}
                showBar
                onClick={() => navigate("/dashboard/checkins?service=boarding")}
              />
              <OccupancyCard
                label="Cats boarding"
                value={data.catsBoarding}
                total={CAT_ROOM_CAPACITY}
                showBar
                onClick={() => navigate("/boarding")}
              />
              <OccupancyCard
                label="Daycare today"
                value={data.daycareToday}
                onClick={() => navigate("/dashboard/checkins?service=daycare")}
              />
              <OccupancyCard label="Park visits today" value={data.parkToday} onClick={() => navigate("/park")} />
              <OccupancyCard label="Grooming today" value={data.groomingToday} onClick={() => navigate("/grooming")} />
            </div>

            {/* Bottom 4 columns */}
            <div className="grid grid-cols-4 gap-3">
              {/* Vaccination alerts */}
              <CardSection title="Vaccination alerts" count={data.vaxAlerts.length}>
                {data.vaxAlerts.length === 0 ? (
                  <div className="py-6 flex flex-col items-center text-center text-xs text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mb-1.5" />
                    All vaccinations current
                  </div>
                ) : (
                  data.vaxAlerts.map((v, i) => (
                    <Row key={i} onClick={() => navigate(`/customers/${v.ownerId}`)}>
                      <div className="flex-1">
                        <span className="font-medium">{v.petName}</span>
                        <span className="text-[11px] text-muted-foreground/70 ml-1">· {v.vaccineName}</span>
                      </div>
                      <Chip variant={v.daysLeft <= 7 ? "red" : "amber"}>{v.daysLeft}d</Chip>
                    </Row>
                  ))
                )}
              </CardSection>

              {/* Payments due today */}
              <CardSection title="Payments due today" empty={data.paymentsDue.length === 0 ? "No payments due today" : undefined}>
                {data.paymentsDue.map((p) => (
                  <Row key={p.id} onClick={() => navigate(p.ownerId ? `/customers/${p.ownerId}` : "/billing")}>
                    <div className="flex-1">
                      <div className="font-medium text-[13px]">{p.ownerLastName}</div>
                      <div className="text-[11px] text-muted-foreground/70">{p.serviceType?.replace(/_/g, " ") ?? "—"} · {p.invoiceNumber ?? "—"}</div>
                    </div>
                    <div className="text-[13px] font-medium text-right whitespace-nowrap text-amber-600">{formatAed(p.total)}</div>
                  </Row>
                ))}
                {data.paymentsDue.length > 0 && (
                  <div className="flex justify-between pt-2 border-t border-border mt-1.5 text-xs text-muted-foreground">
                    <span>{data.paymentsDue.length} invoice{data.paymentsDue.length !== 1 ? "s" : ""}</span>
                    <span className="font-medium text-foreground">{formatAed(data.paymentsDue.reduce((s, p) => s + p.total, 0))}</span>
                  </div>
                )}
              </CardSection>

              {/* Payments overdue */}
              <CardSection title="Payments overdue" empty={data.paymentsOverdue.length === 0 ? "No overdue invoices" : undefined}>
                {data.paymentsOverdue.map((p) => (
                  <Row key={p.id} onClick={() => navigate(p.ownerId ? `/customers/${p.ownerId}` : "/billing")}>
                    <div className="flex-1">
                      <div className="font-medium text-[13px]">{p.ownerLastName}</div>
                      <div className="text-[11px] text-muted-foreground/70">{p.serviceType?.replace(/_/g, " ") ?? "—"} · {p.daysOverdue} day{p.daysOverdue !== 1 ? "s" : ""} late</div>
                    </div>
                    <div className="text-[13px] font-medium text-right whitespace-nowrap text-red-600">{formatAed(p.total)}</div>
                  </Row>
                ))}
                {data.paymentsOverdue.length > 0 && (
                  <div className="flex justify-between pt-2 border-t border-border mt-1.5 text-xs text-muted-foreground">
                    <span>{data.paymentsOverdue.length} overdue</span>
                    <span className="font-medium text-red-600">{formatAed(data.paymentsOverdue.reduce((s, p) => s + p.total, 0))}</span>
                  </div>
                )}
              </CardSection>

              {/* Top-up requests */}
              <CardSection title="Top-up requests" empty={data.topupRequests.length === 0 ? "All wallet balances healthy" : undefined}>
                {data.topupRequests.map((tr) => (
                  <div key={tr.ownerId} className="py-2 border-b border-border last:border-b-0">
                    {tr.requestId ? (
                      <>
                        <button
                          type="button"
                          className="flex w-full items-center rounded-md px-1 py-0.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => navigate(`/customers/${tr.ownerId}`)}
                        >
                          <Dot color="purple" />
                          <div className="flex-1 font-medium text-[13px] ml-1.5">{tr.ownerName}</div>
                          <Chip variant="purple">pending {tr.daysPending}d</Chip>
                        </button>
                        <div className="pl-[13px] text-[11px] text-muted-foreground/70 mt-1">
                          Balance {formatAed(tr.walletBalance)} · requested {formatAed(tr.amountRequested ?? 0)}
                        </div>
                        <div className="pl-[13px] flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemind(tr.requestId!);
                            }}
                          >
                            Remind
                          </button>
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded border border-[#AFA9EC] bg-[#EEEDFE] text-[#3C3489] hover:bg-[#DDD9FC]"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkReceived(tr.requestId!, tr.ownerId, tr.amountRequested ?? 0);
                            }}
                          >
                            Mark received
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => navigate(`/customers/${tr.ownerId}`)}
                        >
                          <Dot color="gray" />
                          <span className="text-muted-foreground text-xs truncate">{tr.ownerName} — no request sent</span>
                        </button>
                        <button
                          type="button"
                          className="text-[11px] px-2 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-muted whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            const suggested = Math.ceil((data.lowBalanceThreshold - tr.walletBalance) / 1000) * 1000;
                            handleRequestTopup(tr.ownerId, Math.max(suggested, 1000));
                          }}
                        >
                          Request {formatAed(Math.max(Math.ceil((data.lowBalanceThreshold - tr.walletBalance) / 1000) * 1000, 1000))}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {data.lowBalanceCount > 0 && (
                  <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted-foreground/70">
                    {data.lowBalanceCount} wallet{data.lowBalanceCount !== 1 ? "s" : ""} below {formatAed(data.lowBalanceThreshold)} threshold
                  </div>
                )}
              </CardSection>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
};

export default DashboardPage;
