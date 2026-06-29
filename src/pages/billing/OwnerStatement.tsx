import { useMemo, useRef } from "react";
import { format } from "date-fns";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import { useOwner } from "@/hooks/useOwners";
import { useStatementOfAccount } from "@/hooks/useStatement";
import { useStatementLedger } from "@/hooks/useWallet";
import { StatementLedgerTable } from "@/components/billing/StatementLedgerTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { invoiceBalanceDue } from "@/lib/invoiceStatus";

function aed(v: number) {
  return `AED ${v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function collectableBalance(status: string, total: number, amountPaid = 0): number {
  return invoiceBalanceDue(status, total, amountPaid);
}

export default function OwnerStatementPage() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();
  const { data: owner } = useOwner(ownerId || "");
  const { data: statement = [], isLoading: statementLoading } = useStatementOfAccount(ownerId);
  const { data: ledger = [], isLoading: ledgerLoading } = useStatementLedger(ownerId);
  const printRef = useRef<HTMLDivElement>(null);

  const ownerName = owner ? `${owner.first_name} ${owner.last_name ?? ""}`.trim() : "owner";

  const outstanding = useMemo(
    () =>
      statement
        .filter((r) => ["outstanding", "overdue", "partially_paid"].includes(r.status))
        .filter((r) => collectableBalance(r.status, r.total, r.amount_paid ?? 0) > 0)
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
    [statement],
  );

  const outstandingTotal = useMemo(
    () => outstanding.reduce((sum, r) => sum + collectableBalance(r.status, r.total, r.amount_paid ?? 0), 0),
    [outstanding],
  );

  const lifetimeSpend = useMemo(
    () => statement.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total, 0),
    [statement],
  );

  const printStatement = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Statement — ${ownerName}</title><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111}
      table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
      th{background:#f6f6f6;font-size:12px;color:#666;text-transform:uppercase}
      .debit{color:#dc2626}.credit{color:#059669}.balance{font-weight:600}
      .muted{color:#6b7280;font-size:11px}
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      <TopBar title="Statement of Account" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(ownerId ? `/customers/${ownerId}` : "/billing/invoices")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {ownerName !== "owner" ? ownerName : "Back"}
          </Button>
          <Button onClick={printStatement} variant="outline">Print statement</Button>
        </div>

        <div ref={printRef} className="space-y-6">
          {/* ── Summary header ── */}
          <Card>
            <CardContent className="p-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Client</p>
                <p className="text-xl font-semibold">{ownerName || "—"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">Woof</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Wallet balance</p>
                <p className="text-2xl font-bold tabular-nums">{aed(owner?.wallet_balance ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Lifetime spend {aed(lifetimeSpend)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
                <p className={`text-2xl font-bold tabular-nums ${outstandingTotal > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {aed(outstandingTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {outstanding.length} unpaid invoice{outstanding.length !== 1 ? "s" : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── Outstanding invoices ── */}
          {!statementLoading && outstanding.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Outstanding invoices</CardTitle>
                  <span className="text-sm font-semibold tabular-nums">{aed(outstandingTotal)}</span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2">
                {outstanding.map((r) => (
                  <div key={r.invoice_id} className="rounded-md border p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/billing/invoices/${r.invoice_id}?returnTo=${encodeURIComponent(`/billing/statements/${ownerId}`)}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {r.invoice_number ?? r.invoice_id.slice(0, 8)}
                        </Link>
                      </div>
                      <p className="text-sm capitalize mt-0.5">{r.service_type?.replace(/_/g, " ") ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {r.due_date ? format(new Date(`${r.due_date}T00:00:00`), "d MMM yyyy") : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {aed(collectableBalance(r.status, r.total, r.amount_paid ?? 0))}
                      </p>
                      {r.days_overdue > 0 && (
                        <p className="text-xs text-red-600">Overdue {r.days_overdue}d</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Bank-statement ledger ── */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base">Transaction history</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <StatementLedgerTable
                rows={ledger}
                isLoading={ledgerLoading}
                ownerName={ownerName}
                returnTo={ownerId ? `/billing/statements/${ownerId}` : undefined}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
