import { useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import { formatAed } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { voidInvoice } from "@/services/invoiceService";
import { useInvoiceLedger, invoiceLedgerQueryKey } from "@/hooks/useInvoiceLedger";
import { useAccountBalance, accountBalanceQueryKey } from "@/hooks/useAccountBalance";

interface InvoiceLedgerCardProps {
  invoiceId: string;
  /** Called after a successful void so the parent page can refetch. */
  onChanged?: () => void;
}

const UNPAID_STATUSES = new Set([
  "outstanding",
  "overdue",
  "partially_paid",
  "issued",
]);

export function InvoiceLedgerCard({ invoiceId, onChanged }: InvoiceLedgerCardProps) {
  const queryClient = useQueryClient();
  const { data: ledger, isLoading } = useInvoiceLedger(invoiceId);
  const { data: account } = useAccountBalance(ledger?.invoice.owner_id);

  const [showAmendments, setShowAmendments] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [voidedBy, setVoidedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amendmentLock = useMemo(() => {
    const lockedAt = ledger?.invoice.amendment_locked_at;
    if (!lockedAt || ledger?.invoice.status !== "outstanding") return null;
    const lockMs = new Date(lockedAt).getTime();
    return { lockMs, locked: Date.now() >= lockMs, at: new Date(lockedAt) };
  }, [ledger]);

  if (isLoading || !ledger) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Loading ledger…
        </CardContent>
      </Card>
    );
  }

  const { invoice, lines, payments, amendments, charges, totalPaid } = ledger;
  const accountBalance = account?.accountBalance ?? 0;
  // Per-invoice net: payments collected minus charges on this invoice.
  const closingBalance = totalPaid - charges;
  const inCredit = closingBalance >= 0;
  const canVoid = invoice.status !== "finalised" && invoice.status !== "voided";
  const hasPayments = payments.length > 0;

  // This invoice's contribution to outstanding debt, used to detect whether the
  // owner has *other* unpaid invoices on their account.
  const thisOutstanding =
    !invoice.receipt_only &&
    (invoice.status === "outstanding" ||
      invoice.status === "overdue" ||
      invoice.status === "partially_paid")
      ? Math.max(0, charges - totalPaid)
      : 0;
  const otherOutstanding = Math.max(0, (account?.outstandingDebt ?? 0) - thisOutstanding);
  const hasOtherUnpaid = otherOutstanding > 0.01;

  const handleVoid = async () => {
    if (!voidReason.trim()) {
      toast.error("A void reason is mandatory.");
      return;
    }
    setSubmitting(true);
    const res = await voidInvoice({
      invoiceId,
      voidedBy: voidedBy.trim() || "reception",
      reason: voidReason.trim(),
      refundNote: refundNote.trim() || undefined,
      refundAmount: refundAmount ? Number(refundAmount) : undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error ?? "Could not void invoice.");
      return;
    }
    toast.success("Invoice voided successfully");
    setVoidOpen(false);
    setVoidReason("");
    setRefundNote("");
    setRefundAmount("");
    queryClient.invalidateQueries({ queryKey: invoiceLedgerQueryKey(invoiceId) });
    queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey(invoice.owner_id) });
    onChanged?.();
  };

  return (
    <Card data-testid="invoice-ledger-card">
      <CardContent className="p-5 space-y-4">
        {/* Banners */}
        {invoice.deposit_bypassed ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2"
            data-testid="invoice-ledger-deposit-bypass-banner"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Deposit bypassed</p>
              {invoice.deposit_bypass_reason ? (
                <p className="text-amber-800">{invoice.deposit_bypass_reason}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {UNPAID_STATUSES.has(invoice.status) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
            This invoice is <strong>{invoice.status.replace(/_/g, " ")}</strong> and has an
            outstanding balance.
          </div>
        ) : null}

        {hasOtherUnpaid ? (
          <div
            className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 flex items-start gap-2"
            data-testid="invoice-ledger-other-unpaid-banner"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              This owner has other unpaid invoices totalling{" "}
              <strong>{formatAed(otherOutstanding)}</strong> on their account.
            </span>
          </div>
        ) : null}

        {amendmentLock ? (
          <div
            className={`rounded-md border p-3 text-sm flex items-center gap-2 ${
              amendmentLock.locked
                ? "border-slate-300 bg-slate-50 text-slate-600"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
            data-testid="invoice-ledger-amendment-lock"
          >
            <Lock className="h-4 w-4 shrink-0" />
            {amendmentLock.locked ? (
              <span>Amendments locked since {format(amendmentLock.at, "d MMM yyyy, HH:mm")}.</span>
            ) : (
              <span>
                Editable for {formatDistanceToNowStrict(amendmentLock.at)} (until{" "}
                {format(amendmentLock.at, "d MMM, HH:mm")}). Amendments require a reason.
              </span>
            )}
          </div>
        ) : null}

        {/* Ledger body */}
        <div className="space-y-1 text-sm md:max-w-md">
          <div className="flex justify-between pb-1">
            <span className="text-muted-foreground">Account balance</span>
            <span
              className={`tabular-nums font-medium ${
                accountBalance >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
              data-testid="invoice-ledger-account-balance"
            >
              {accountBalance >= 0 ? "+" : ""}
              {formatAed(accountBalance)}
            </span>
          </div>

          <div className="pt-2 border-t">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Charges
            </p>
            {lines.length === 0 ? (
              <p className="text-muted-foreground py-1">No line items.</p>
            ) : (
              lines.map((l) => {
                const total = l.total_price ?? l.line_total ?? l.unit_price * l.quantity;
                return (
                  <div key={l.id} className="flex justify-between py-0.5">
                    <span>{l.description}</span>
                    <span className="tabular-nums text-red-700">-{formatAed(total)}</span>
                  </div>
                );
              })
            )}
            <div className="flex justify-between border-t mt-1 pt-1 font-medium">
              <span>Charges total</span>
              <span className="tabular-nums text-red-700">-{formatAed(charges)}</span>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Payments
            </p>
            {payments.length === 0 ? (
              <p className="text-muted-foreground py-1">No payments recorded.</p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="flex justify-between py-0.5">
                  <span>
                    {paymentMethodLabel(p.payment_method)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {format(new Date(p.created_at), "d MMM, HH:mm")}
                    </span>
                  </span>
                  <span className="tabular-nums text-emerald-700">+{formatAed(p.amount)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between border-t mt-1 pt-1 font-medium">
              <span>Total paid</span>
              <span className="tabular-nums text-emerald-700">+{formatAed(totalPaid)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t-2 mt-2 pt-2 text-base font-semibold">
            <span>Closing balance</span>
            <span
              className={`tabular-nums ${inCredit ? "text-emerald-700" : "text-red-700"}`}
              data-testid="invoice-ledger-closing-balance"
            >
              {inCredit ? "+" : ""}
              {formatAed(closingBalance)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {inCredit
              ? "This invoice is fully covered."
              : "Balance still due on this invoice."}
          </p>
        </div>

        {/* Amendment history */}
        {amendments.length > 0 ? (
          <div className="pt-2 border-t">
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowAmendments((v) => !v)}
              data-testid="invoice-ledger-amendments-toggle"
            >
              {showAmendments ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Amendment history ({amendments.length})
            </button>
            {showAmendments ? (
              <div className="mt-2 space-y-2">
                {amendments.map((a) => (
                  <div key={a.id} className="rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{a.field_changed}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(a.amended_at), "d MMM yyyy, HH:mm")}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {a.old_value ?? "—"} → {a.new_value ?? "—"}
                    </p>
                    <p className="text-xs">
                      {a.reason} · {a.amended_by}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Void action (reception) */}
        {canVoid ? (
          <div className="pt-2 border-t">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setRefundAmount(hasPayments ? String(totalPaid) : "");
                setVoidOpen(true);
              }}
              data-testid="invoice-ledger-void-btn"
            >
              Void invoice
            </Button>
          </div>
        ) : invoice.status === "voided" ? (
          <p className="text-sm text-muted-foreground pt-2 border-t">
            Voided{invoice.voided_by ? ` by ${invoice.voided_by}` : ""}
            {invoice.voided_at
              ? ` on ${format(new Date(invoice.voided_at), "d MMM yyyy, HH:mm")}`
              : ""}
            . {invoice.voided_reason ?? ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground pt-2 border-t">
            Finalised invoices cannot be voided.
          </p>
        )}
      </CardContent>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void invoice</DialogTitle>
            <DialogDescription>
              Voiding never deletes the invoice. A reason is mandatory and is logged with your name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Reason (required)</Label>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Why is this invoice being voided?"
                data-testid="invoice-ledger-void-reason"
              />
            </div>
            {hasPayments ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-amber-900 text-xs">
                  This invoice has recorded payments. Refunds are discretionary — log the amount and
                  a note if a refund is being granted.
                </p>
                <div className="space-y-1">
                  <Label>Discretionary refund amount (AED)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Refund note</Label>
                  <Textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
                </div>
              </div>
            ) : null}
            <StaffNameSelect value={voidedBy} onChange={setVoidedBy} label="Voided by" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoid}
              disabled={submitting}
              data-testid="invoice-ledger-void-confirm"
            >
              {submitting ? "Voiding…" : "Void invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
