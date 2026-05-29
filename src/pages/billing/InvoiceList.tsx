import { useEffect, useMemo, useState } from "react";
import { OwnerSearchPopover } from "@/components/billing/OwnerSearchPopover";
import { ConsolidateInvoicesDialog } from "@/components/billing/ConsolidateInvoicesDialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { useInvoices, useInvoiceKpis } from "@/hooks/useInvoices";
import { canConsolidateInvoiceStatus } from "@/lib/invoiceConsolidation";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Trash2 } from "lucide-react";
import { buildOverdueInvoiceWhatsAppUrl } from "@/lib/whatsappInvoiceReminder";
import type { InvoiceSummary } from "@/hooks/useInvoices";
import { DeleteInvoiceDialog } from "@/components/billing/DeleteInvoiceDialog";
import { formatAed } from "@/lib/money";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

const STATUSES: InvoiceStatus[] = [
  "draft",
  "finalised",
  "issued",
  "outstanding",
  "overdue",
  "partially_paid",
  "paid",
  "voided",
  "cancelled",
];

const STATUS_PRESETS: { label: string; statuses: InvoiceStatus[] }[] = [
  {
    label: "Awaiting payment",
    statuses: ["finalised", "issued", "outstanding", "overdue", "partially_paid"],
  },
  { label: "Settled", statuses: ["paid"] },
  { label: "Closed", statuses: ["voided", "cancelled"] },
];

const WHATSAPP_REMINDER_STATUSES: InvoiceStatus[] = [
  "draft",
  "issued",
  "finalised",
  "partially_paid",
  "outstanding",
  "overdue",
];

function showOverdueWhatsAppReminder(inv: InvoiceSummary): boolean {
  return (
    WHATSAPP_REMINDER_STATUSES.includes(inv.status) &&
    (inv.status === "overdue" || inv.days_overdue > 0)
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: "border-slate-300 text-slate-700 bg-slate-50",
  finalised: "border-blue-300 text-blue-700 bg-blue-50",
  outstanding: "border-amber-300 text-amber-700 bg-amber-50",
  overdue: "border-red-300 text-red-700 bg-red-50",
  partially_paid: "border-amber-300 text-amber-700 bg-amber-50",
  issued: "border-sky-300 text-sky-700 bg-sky-50",
  cancelled: "border-slate-300 text-slate-500 bg-slate-100 line-through",
  paid: "border-emerald-300 text-emerald-700 bg-emerald-50",
  voided: "border-slate-300 text-slate-500 bg-slate-100 line-through",
};

function renderBranchCode(branchCode: string | null) {
  if (!branchCode) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="font-mono text-[11px]">
      {branchCode}
    </Badge>
  );
}

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<InvoiceStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [ownerLabel, setOwnerLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [consolidateOpen, setConsolidateOpen] = useState(false);
  const { data: invoices = [], isLoading } = useInvoices({
    ownerId,
    status,
    from: from || undefined,
    to: to || undefined,
    serviceType,
  });
  const kpis = useInvoiceKpis(invoices);

  const consolidatableInvoices = useMemo(
    () => invoices.filter((inv) => canConsolidateInvoiceStatus(inv.status)),
    [invoices],
  );

  useEffect(() => {
    setSelectedIds([]);
  }, [ownerId]);

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

  const statusParam = searchParams.get("status");
  useEffect(() => {
    const raw = (statusParam ?? "").trim();
    if (!raw) {
      setStatus([]);
      return;
    }
    const next = raw
      .split(",")
      .map((s) => s.trim() as InvoiceStatus)
      .filter((s): s is InvoiceStatus => STATUSES.includes(s));
    setStatus((prev) => {
      const same =
        prev.length === next.length && prev.every((s, i) => s === next[i]);
      return same ? prev : Array.from(new Set(next));
    });
  }, [statusParam]);

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
              <OwnerSearchPopover
                ownerId={ownerId}
                ownerLabel={ownerLabel}
                placeholder="Search name/phone"
                inputTestId="billing-invoice-list-owner-search"
                onSelect={(id, label) => {
                  setOwnerId(id);
                  setOwnerLabel(label);
                }}
                onClear={() => {
                  setOwnerId(undefined);
                  setOwnerLabel("");
                }}
              />
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
                      // Clear `?status=` from URL or the effect below re-applies status from the query string.
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete("status");
                          return next;
                        },
                        { replace: true },
                      );
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
              {STATUS_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus(preset.statuses)}
                >
                  {preset.label}
                </Button>
              ))}
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

        {ownerId && consolidatableInvoices.length >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span>
              <span className="font-medium">{ownerLabel || "This owner"}</span> has{" "}
              {consolidatableInvoices.length} open invoices — select rows below, then consolidate.
            </span>
            {selectedIds.length >= 2 && (
              <Button
                size="sm"
                data-testid="billing-invoice-list-consolidate-btn"
                onClick={() => setConsolidateOpen(true)}
              >
                Consolidate selected ({selectedIds.length})
              </Button>
            )}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {ownerId ? <TableHead className="w-10" /> : null}
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead className="w-[44px] text-center" aria-label="WhatsApp reminder" />
                    <TableHead className="w-[52px] text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={ownerId ? 11 : 10} className="h-24 text-center text-muted-foreground">No invoices found.</TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => {
                      const canSelect = !!ownerId && canConsolidateInvoiceStatus(inv.status);
                      const waUrl = showOverdueWhatsAppReminder(inv)
                        ? buildOverdueInvoiceWhatsAppUrl({
                            phone: inv.owner_phone,
                            ownerName: inv.owner_name,
                            invoiceNumberDisplay: inv.invoice_number?.trim() || inv.id.slice(0, 8),
                            amountAed: inv.total,
                          })
                        : null;
                      return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                      >
                        {ownerId ? (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {canSelect ? (
                              <Checkbox
                                checked={selectedIds.includes(inv.id)}
                                data-testid={`billing-invoice-list-select-${inv.id}`}
                                onCheckedChange={(checked) => {
                                  setSelectedIds((prev) =>
                                    checked
                                      ? [...prev, inv.id]
                                      : prev.filter((id) => id !== inv.id),
                                  );
                                }}
                              />
                            ) : null}
                          </TableCell>
                        ) : null}
                        <TableCell className="font-mono text-xs">{inv.invoice_number ?? inv.id.slice(0, 8)}</TableCell>
                        <TableCell>{inv.owner_name}</TableCell>
                        <TableCell>{renderBranchCode(inv.branch_code)}</TableCell>
                        <TableCell className="capitalize">{inv.service_type?.replace(/_/g, " ") ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft}>
                            {inv.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatAed(inv.total)}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(`${inv.due_date}T00:00:00`), "d MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.days_overdue > 0 ? <span className="text-red-600">{inv.days_overdue}d</span> : "0d"}
                        </TableCell>
                        <TableCell className="p-1 text-center">
                          {showOverdueWhatsAppReminder(inv) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                              disabled={!waUrl}
                              title={waUrl ? "Send WhatsApp reminder" : "No phone number on file"}
                              aria-label="Open WhatsApp overdue reminder"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (waUrl) window.open(waUrl, "_blank", "noopener,noreferrer");
                              }}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="inline-block w-8" />
                          )}
                        </TableCell>
                        <TableCell className="text-right p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Delete invoice"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(inv);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {deleteTarget ? (
        <DeleteInvoiceDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          invoiceUuid={deleteTarget.id}
          invoiceNumberDisplay={deleteTarget.invoice_number?.trim() || deleteTarget.id.slice(0, 8)}
          ownerName={deleteTarget.owner_name}
          totalAmount={deleteTarget.total}
        />
      ) : null}

      {ownerId && selectedIds.length >= 2 ? (
        <ConsolidateInvoicesDialog
          open={consolidateOpen}
          onOpenChange={setConsolidateOpen}
          ownerId={ownerId}
          invoiceIds={selectedIds}
          onSuccess={() => setSelectedIds([])}
        />
      ) : null}
    </>
  );
}
