import { useMemo, useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAedAmount } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import type { EnrichedWalletTransaction } from "@/hooks/useWallet";

// ── Label helpers ─────────────────────────────────────────────────────────────

const TRANSACTION_LABELS: Record<string, string> = {
  top_up: "Wallet Top-up",
  manual_topup: "Manual Top-up",
  refund: "Refund",
  deduction: "Wallet Deduction",
  membership_fee: "Membership Fee",
  adjustment: "Adjustment",
  card_payment: "Card Payment",
  cash_payment: "Cash Payment",
  bank_transfer_payment: "Bank Transfer",
  payment_link_payment: "Payment Link",
};

function txLabel(type: string): string {
  return TRANSACTION_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function serviceLabel(type: string | null | undefined): string {
  if (!type) return "";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function aed(v: number): string {
  return `AED ${formatAedAmount(Math.abs(v))}`;
}

// ── Date range ────────────────────────────────────────────────────────────────

type DateRangeOption = "30d" | "90d" | "180d" | "all";

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 180 days" },
  { value: "all", label: "All time" },
];

function cutoffForRange(range: DateRangeOption): Date | null {
  if (range === "all") return null;
  const days = parseInt(range, 10);
  return startOfDay(subDays(new Date(), days));
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(rows: EnrichedWalletTransaction[], ownerName: string) {
  const header = ["Date", "Description", "Service", "Service Date", "Invoice #", "Payment Method", "Debit (AED)", "Credit (AED)", "Balance (AED)", "Notes"];
  const lines = rows.map((r) => {
    const isCredit = r.amount > 0;
    return [
      format(new Date(r.created_at), "d MMM yyyy"),
      txLabel(r.transaction_type),
      serviceLabel(r.invoices?.service_type),
      r.invoices?.issue_date ? format(new Date(`${r.invoices.issue_date}T00:00:00`), "d MMM yyyy") : "",
      r.invoices?.invoice_number ?? r.invoice_id ?? "",
      paymentMethodLabel(r.payment_method),
      isCredit ? "" : formatAedAmount(Math.abs(r.amount)),
      isCredit ? formatAedAmount(r.amount) : "",
      formatAedAmount(r.balance_after),
      (r.notes ?? "").replace(/,/g, " "),
    ].join(",");
  });
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${ownerName.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StatementLedgerTableProps {
  rows: EnrichedWalletTransaction[];
  isLoading: boolean;
  ownerName?: string;
  /** When set, invoice links append ?returnTo=<returnTo> so the invoice back button returns here. */
  returnTo?: string;
}

export function StatementLedgerTable({ rows, isLoading, ownerName = "owner", returnTo }: StatementLedgerTableProps) {
  const [range, setRange] = useState<DateRangeOption>("90d");

  const cutoff = useMemo(() => cutoffForRange(range), [range]);

  const filteredRows = useMemo(() => {
    if (!cutoff) return rows;
    return rows.filter((r) => new Date(r.created_at) >= cutoff);
  }, [rows, cutoff]);

  // Opening balance = balance_after of the row just before the filtered period
  const openingBalance = useMemo(() => {
    if (!cutoff || filteredRows.length === rows.length) return null;
    const firstExcluded = rows[filteredRows.length];
    return firstExcluded?.balance_after ?? 0;
  }, [rows, filteredRows, cutoff]);

  // Closing balance = balance_after of the most recent row (first in newest-first list)
  const closingBalance = filteredRows[0]?.balance_after ?? null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={range} onValueChange={(v) => setRange(v as DateRangeOption)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => exportCsv(filteredRows, ownerName)}
          disabled={filteredRows.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Period summary badges */}
      {(openingBalance !== null || closingBalance !== null) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {openingBalance !== null && (
            <span>
              Opening balance:{" "}
              <span className="font-medium tabular-nums text-foreground">{aed(openingBalance)}</span>
            </span>
          )}
          {closingBalance !== null && (
            <span>
              Closing balance:{" "}
              <span className="font-medium tabular-nums text-foreground">{aed(closingBalance)}</span>
            </span>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No transactions in this period.</p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28 whitespace-nowrap">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                  <TableHead className="whitespace-nowrap">Method</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Debit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Credit</TableHead>
                  <TableHead className="text-right whitespace-nowrap font-semibold">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const isCredit = row.amount > 0;
                  const absAmount = Math.abs(row.amount);
                  const service = serviceLabel(row.invoices?.service_type);
                  const invoiceNumber = row.invoices?.invoice_number;
                  const issueDate = row.invoices?.issue_date
                    ? format(new Date(`${row.invoices.issue_date}T00:00:00`), "d MMM yyyy")
                    : null;

                  return (
                    <TableRow key={row.id} className="text-sm">
                      {/* Date */}
                      <TableCell className="text-muted-foreground whitespace-nowrap align-top pt-3">
                        {format(new Date(row.created_at), "d MMM yyyy")}
                        <div className="text-xs opacity-60">
                          {format(new Date(row.created_at), "HH:mm")}
                        </div>
                      </TableCell>

                      {/* Description */}
                      <TableCell className="align-top pt-3">
                        <div className="font-medium">{txLabel(row.transaction_type)}</div>
                        {service && (
                          <div className="text-xs text-muted-foreground">{service}</div>
                        )}
                        {issueDate && (
                          <div className="text-xs text-muted-foreground">Service date: {issueDate}</div>
                        )}
                        {row.notes && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-xs text-muted-foreground truncate max-w-[180px] cursor-default mt-0.5">
                                {row.notes}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs break-words">
                              {row.notes}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>

                      {/* Invoice # */}
                      <TableCell className="align-top pt-3 whitespace-nowrap">
                        {row.invoice_id ? (
                          <Link
                            to={`/billing/invoices/${row.invoice_id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                            className="text-primary hover:underline font-mono text-xs"
                          >
                            {invoiceNumber ?? row.invoice_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Payment method */}
                      <TableCell className="align-top pt-3">
                        {row.payment_method ? (
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {paymentMethodLabel(row.payment_method)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Debit */}
                      <TableCell className="text-right align-top pt-3 tabular-nums font-mono text-sm">
                        {!isCredit ? (
                          <span className="text-red-600 dark:text-red-400">
                            {formatAedAmount(absAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>

                      {/* Credit */}
                      <TableCell className="text-right align-top pt-3 tabular-nums font-mono text-sm">
                        {isCredit ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {formatAedAmount(absAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>

                      {/* Running balance */}
                      <TableCell className="text-right align-top pt-3 tabular-nums font-mono text-sm font-semibold">
                        <span className={row.balance_after < 0 ? "text-red-600 dark:text-red-400" : ""}>
                          {aed(row.balance_after)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      <p className="text-xs text-muted-foreground text-right">
        {filteredRows.length} transaction{filteredRows.length !== 1 ? "s" : ""}
        {range !== "all" ? ` · ${DATE_RANGE_OPTIONS.find((o) => o.value === range)?.label}` : ""}
      </p>
    </div>
  );
}
