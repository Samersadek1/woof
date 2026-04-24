import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, useParams } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useOwner } from "@/hooks/useOwners";
import { useStatementOfAccount } from "@/hooks/useStatement";
import { useWalletTransactions } from "@/hooks/useWallet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function aed(v: number) {
  return `AED ${v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OwnerStatementPage() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const { data: owner } = useOwner(ownerId || "");
  const { data: statement = [], isLoading } = useStatementOfAccount(ownerId);
  const { data: tx = [] } = useWalletTransactions(ownerId || "");
  const printRef = useRef<HTMLDivElement>(null);
  const [walletPage, setWalletPage] = useState(1);
  const perPage = 20;

  const outstanding = useMemo(
    () =>
      statement
        .filter((r) => ["draft", "issued", "finalised", "outstanding", "overdue", "partially_paid"].includes(r.status))
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
    [statement],
  );

  const byMonth = useMemo(() => {
    const m = new Map<string, typeof statement>();
    for (const row of statement) {
      const key = format(new Date(row.created_at), "yyyy-MM");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(row);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [statement]);

  const lifetimeSpend = useMemo(
    () => statement.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total_aed, 0),
    [statement],
  );

  const walletRows = tx.slice((walletPage - 1) * perPage, walletPage * perPage);
  const walletPages = Math.max(1, Math.ceil(tx.length / perPage));

  const printStatement = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Statement</title><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111}
      table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
      th{background:#f6f6f6;font-size:12px;color:#666;text-transform:uppercase}
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      <TopBar title="Owner Statement" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <Link to="/billing/invoices" className="text-primary hover:underline">Invoices</Link> / Statement
          </div>
          <Button onClick={printStatement}>Print statement</Button>
        </div>

        <div ref={printRef} className="space-y-6">
          <Card>
            <CardContent className="p-5 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Owner</p>
                <p className="text-xl font-semibold">{owner ? `${owner.first_name} ${owner.last_name ?? ""}`.trim() : "—"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">{owner?.member_type ?? "standard"}</Badge>
                  {owner?.membership_date && <span className="text-xs text-muted-foreground">Since {owner.membership_date}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Wallet balance</p>
                <p className="text-3xl font-bold tabular-nums">{aed(owner?.wallet_balance ?? 0)}</p>
                <p className="text-sm text-muted-foreground mt-1">Lifetime spend {aed(lifetimeSpend)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold">Outstanding invoices</h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : outstanding.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
              ) : (
                <div className="space-y-2">
                  {outstanding.map((r) => (
                    <div key={r.invoice_id} className="rounded-md border p-3 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs">{r.invoice_number ?? r.invoice_id.slice(0, 8)}</p>
                        <p className="text-sm capitalize">{r.service_type?.replace(/_/g, " ") ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">Due {r.due_date ? format(new Date(`${r.due_date}T00:00:00`), "d MMM yyyy") : "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{aed(r.total_aed)}</p>
                        {r.days_overdue > 0 && <p className="text-xs text-red-600">Overdue {r.days_overdue}d</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold">History</h3>
              {byMonth.map(([month, rows]) => (
                <details key={month} open className="rounded-md border p-3">
                  <summary className="cursor-pointer font-medium">{month}</summary>
                  <Separator className="my-2" />
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <div key={r.invoice_id} className="flex items-center justify-between text-sm">
                        <span>{r.invoice_number ?? r.invoice_id.slice(0, 8)} · {r.status}</span>
                        <span className="tabular-nums">{aed(r.total_aed)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold">Wallet activity</h3>
              {walletRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallet activity.</p>
              ) : (
                <div className="space-y-2">
                  {walletRows.map((w) => (
                    <div key={w.id} className="rounded-md border p-3 text-sm flex justify-between items-center">
                      <div>
                        <p className="capitalize">{w.transaction_type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(w.created_at), "d MMM yyyy, HH:mm")}</p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p>{aed(w.amount)}</p>
                        <p className="text-xs text-muted-foreground">Balance {aed(w.balance_after)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" disabled={walletPage <= 1} onClick={() => setWalletPage((p) => p - 1)}>Prev</Button>
                <span className="text-xs text-muted-foreground">{walletPage}/{walletPages}</span>
                <Button variant="outline" size="sm" disabled={walletPage >= walletPages} onClick={() => setWalletPage((p) => p + 1)}>Next</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
