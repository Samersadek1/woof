import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { useInvoices, useInvoiceKpis } from "@/hooks/useInvoices";
import { useOwners } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

const STATUSES: InvoiceStatus[] = [
  "draft",
  "finalised",
  "outstanding",
  "overdue",
  "paid",
  "voided",
];

const STATUS_BADGE: Record<string, string> = {
  draft: "border-slate-300 text-slate-700 bg-slate-50",
  finalised: "border-blue-300 text-blue-700 bg-blue-50",
  outstanding: "border-amber-300 text-amber-700 bg-amber-50",
  overdue: "border-red-300 text-red-700 bg-red-50",
  paid: "border-emerald-300 text-emerald-700 bg-emerald-50",
  voided: "border-slate-300 text-slate-500 bg-slate-100 line-through",
};

function formatAed(v: number) {
  return `AED ${v.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<InvoiceStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [ownerLabel, setOwnerLabel] = useState("");

  const { data: ownerHits = [] } = useOwners(ownerSearch.trim().length >= 2 ? ownerSearch : undefined);
  const { data: invoices = [], isLoading } = useInvoices({
    ownerId,
    status,
    from: from || undefined,
    to: to || undefined,
    serviceType,
  });
  const kpis = useInvoiceKpis(invoices);

  const serviceTypes = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) {
      if (i.service_type) set.add(i.service_type);
    }
    return ["all", ...Array.from(set).sort()];
  }, [invoices]);

  const toggleStatus = (s: InvoiceStatus) => {
    setStatus((prev) => (prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]));
  };

  return (
    <>
      <TopBar title="Billing Invoices" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Outstanding AED</p><p className="text-2xl font-bold tabular-nums mt-1">{formatAed(kpis.outstandingTotal)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Overdue Count</p><p className="text-2xl font-bold tabular-nums mt-1">{kpis.overdueCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Due In 7 Days</p><p className="text-2xl font-bold tabular-nums mt-1">{kpis.dueSoonCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Collected This Month</p><p className="text-2xl font-bold tabular-nums mt-1">{formatAed(kpis.collectedThisMonth)}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1">
                <Label>Owner</Label>
                <Input
                  placeholder="Search name/phone"
                  value={ownerLabel || ownerSearch}
                  onChange={(e) => {
                    setOwnerSearch(e.target.value);
                    setOwnerId(undefined);
                    setOwnerLabel("");
                  }}
                />
                {ownerSearch.trim().length >= 2 && !ownerId && ownerHits.length > 0 && (
                  <div className="rounded border bg-background max-h-40 overflow-auto">
                    {ownerHits.slice(0, 8).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setOwnerId(o.id);
                          const label = ownerDisplayName(o.first_name, o.last_name);
                          setOwnerLabel(label);
                          setOwnerSearch("");
                        }}
                      >
                        {ownerDisplayName(o.first_name, o.last_name)} <span className="text-muted-foreground">{o.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Service</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                >
                  {serviceTypes.map((s) => (
                    <option key={s} value={s}>{s === "all" ? "All services" : s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Actions</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setStatus([]);
                      setFrom("");
                      setTo("");
                      setServiceType("all");
                      setOwnerId(undefined);
                      setOwnerLabel("");
                      setOwnerSearch("");
                    }}
                  >
                    Reset
                  </Button>
                  <Button type="button" className="w-full" onClick={() => navigate("/billing/invoices/new")}>
                    New
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`px-3 py-1.5 text-xs rounded-md border ${status.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No invoices found.</TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                      >
                        <TableCell className="font-mono text-xs">{inv.invoice_number ?? inv.id.slice(0, 8)}</TableCell>
                        <TableCell>{inv.owner_name}</TableCell>
                        <TableCell className="capitalize">{inv.service_type?.replace(/_/g, " ") ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft}>
                            {inv.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatAed(inv.total_aed)}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(`${inv.due_date}T00:00:00`), "d MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.days_overdue > 0 ? <span className="text-red-600">{inv.days_overdue}d</span> : "0d"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
