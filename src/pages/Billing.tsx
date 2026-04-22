import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { useOwners, useOwner } from "@/hooks/useOwners";
import {
  useWalletTransactions,
  useTopUpWallet,
  useDeductWallet,
  type WalletTransaction,
} from "@/hooks/useWallet";
import {
  useInvoicesForOwner,
  useCreateInvoice,
  useFinaliseInvoice,
  useProcessPayment,
  useVoidInvoice,
  useCalculateCancellationRefund,
  useOwnerStatement,
  usePricing,
  useServiceRates,
  formatAed,
  type InvoiceStatus,
  type InvoiceWithItems,
  type PaymentMethod as BillingPaymentMethod,
  type ServiceType,
} from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  AlertTriangle,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  ExternalLink,
  Loader2,
  X,
  FileText,
  CreditCard,
  Ban,
  CheckCircle2,
  Clock,
  Receipt,
  Save,
  Printer,
  Eye,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MemberType = Database["public"]["Enums"]["member_type"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type TransactionType = Database["public"]["Enums"]["transaction_type"];

const LOW_BALANCE_THRESHOLD = 500;

const MEMBER_BADGE: Record<MemberType, string> = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  silver: "bg-blue-50 text-blue-700 border-blue-200",
  gold: "bg-amber-50 text-amber-700 border-amber-200",
};

const TX_BADGE: Record<string, { label: string; className: string }> = {
  top_up: { label: "Top Up", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  deduction: { label: "Deduction", className: "bg-red-50 text-red-700 border-red-200" },
  membership_fee: { label: "Membership Fee", className: "bg-purple-50 text-purple-700 border-purple-200" },
  refund: { label: "Refund", className: "bg-sky-50 text-sky-700 border-sky-200" },
  adjustment: { label: "Adjustment", className: "bg-gray-100 text-gray-600 border-gray-200" },
  card_payment: { label: "Card Payment", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  cash_payment: { label: "Cash Payment", className: "bg-teal-50 text-teal-700 border-teal-200" },
};

const INVOICE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600 border-slate-200" },
  issued: { label: "Issued", className: "bg-blue-50 text-blue-700 border-blue-200" },
  finalised: { label: "Finalised", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partially_paid: { label: "Partial", className: "bg-amber-50 text-amber-700 border-amber-200" },
  outstanding: { label: "Outstanding", className: "bg-orange-50 text-orange-700 border-orange-200" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
  voided: { label: "Voided", className: "bg-gray-100 text-gray-500 border-gray-200" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

// ── WalletModal ──────────────────────────────────────────────────────────────

type ModalMode = "topup" | "deduct";

interface WalletModalProps {
  open: boolean;
  mode: ModalMode;
  ownerId: string;
  onClose: () => void;
}

function WalletModal({ open, mode, ownerId, onClose }: WalletModalProps) {
  const topUp = useTopUpWallet();
  const deduct = useDeductWallet();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const isPending = topUp.isPending || deduct.isPending;

  const reset = () => { setAmount(""); setMethod("cash"); setNotes(""); };
  const handleClose = () => { if (!isPending) { reset(); onClose(); } };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("Enter a valid amount"); return; }
    const payload = { owner_id: ownerId, amount: numAmount, payment_method: method, notes: notes.trim() || null };
    const mutation = mode === "topup" ? topUp : deduct;
    const successMsg = mode === "topup"
      ? `AED ${numAmount.toFixed(2)} added to wallet`
      : `AED ${numAmount.toFixed(2)} deducted from wallet`;
    mutation.mutate(payload, {
      onSuccess: () => { toast.success(successMsg); handleClose(); },
      onError: (err) => toast.error(err.message || "Transaction failed"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "topup"
              ? <><ArrowUpCircle className="h-5 w-5 text-emerald-600" /> Top Up Wallet</>
              : <><ArrowDownCircle className="h-5 w-5 text-red-500" /> Deduct from Wallet</>}
          </DialogTitle>
          <DialogDescription>
            {mode === "topup" ? "Add funds to the owner's wallet." : "Remove funds from the owner's wallet."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="tx_amount">Amount (AED) <span className="text-destructive">*</span></Label>
            <Input id="tx_amount" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx_method">Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="tx_method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx_notes">Notes (optional)</Label>
            <Textarea id="tx_notes" rows={2} placeholder="e.g. monthly top-up" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending} className={mode === "topup" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "topup" ? "Add Funds" : "Deduct"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── PaymentDialog ────────────────────────────────────────────────────────────

function PaymentDialog({ open, invoice, onClose }: { open: boolean; invoice: InvoiceWithItems | null; onClose: () => void }) {
  const processPayment = useProcessPayment();
  const [method, setMethod] = useState<BillingPaymentMethod>("wallet");
  const [staffName, setStaffName] = useState("");

  if (!invoice) return null;

  const handlePay = async () => {
    if (!staffName.trim()) { toast.error("Enter staff name"); return; }
    const result = await processPayment.mutateAsync({ invoiceId: invoice.id, method, staffName: staffName.trim() });
    if (result.success) {
      onClose();
    } else if (!result.success && method === "wallet") {
      // wallet errors are toasted inside useProcessPayment — just keep the dialog open
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Process Payment
          </DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoice_number ?? invoice.id.slice(0, 8)} — {formatAed(invoice.total_aed)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as BillingPaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Staff name <span className="text-destructive">*</span></Label>
            <Input placeholder="Who is processing?" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={processPayment.isPending}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={processPayment.isPending} onClick={handlePay}>
            {processPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {formatAed(invoice.total_aed)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── VoidDialog ───────────────────────────────────────────────────────────────

function VoidDialog({ open, invoice, ownerId, onClose }: { open: boolean; invoice: InvoiceWithItems | null; ownerId: string; onClose: () => void }) {
  const voidInvoice = useVoidInvoice();
  const [reason, setReason] = useState("");
  const [staffName, setStaffName] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");

  const { data: refundCalc } = useCalculateCancellationRefund(
    ownerId,
    invoice?.id ?? null,
    invoice?.created_at ?? null,
  );

  useEffect(() => {
    if (refundCalc) setRefundAmount(refundCalc.refundAed.toFixed(2));
  }, [refundCalc]);

  if (!invoice) return null;

  const handleVoid = async () => {
    if (!reason.trim()) { toast.error("Enter a reason"); return; }
    if (!staffName.trim()) { toast.error("Enter staff name"); return; }
    await voidInvoice.mutateAsync({
      invoiceId: invoice.id,
      reason: reason.trim(),
      refundAmount: parseFloat(refundAmount) || 0,
      staffName: staffName.trim(),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" /> Void Invoice
          </DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoice_number ?? invoice.id.slice(0, 8)} — {formatAed(invoice.total_aed)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {refundCalc && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
              <p className="font-medium text-amber-900">{refundCalc.policyLabel}</p>
              <p className="text-amber-700">
                {refundCalc.hoursNotice.toFixed(0)}h notice — {refundCalc.refundPct}% refund = {formatAed(refundCalc.refundAed)}
              </p>
              {refundCalc.overrideActive && (
                <p className="text-amber-800 font-medium">Full refund override active for this owner</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Refund amount (AED)</Label>
            <Input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea rows={2} placeholder="Why is this invoice being voided?" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Approved by <span className="text-destructive">*</span></Label>
            <Input placeholder="Staff name" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={voidInvoice.isPending}>Cancel</Button>
          <Button variant="destructive" disabled={voidInvoice.isPending} onClick={handleVoid}>
            {voidInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Void Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── InvoiceDetailDialog ──────────────────────────────────────────────────────

function InvoiceDetailDialog({
  open,
  invoice,
  ownerName,
  onClose,
}: {
  open: boolean;
  invoice: InvoiceWithItems | null;
  ownerName: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const dateStr = format(new Date(), "d MMM yyyy, HH:mm");
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Invoice ${invoice?.invoice_number ?? ""}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #111; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  .footer { margin-top: 40px; color: #999; font-size: 12px; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>${content}
<div class="footer">Generated ${dateStr}</div>
</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [invoice]);

  if (!invoice) return null;

  const sb = INVOICE_STATUS_BADGE[invoice.status] ?? INVOICE_STATUS_BADGE.draft;
  const lineItems = invoice.line_items ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice {invoice.invoice_number ?? invoice.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Created {format(parseISO(invoice.created_at), "d MMM yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div ref={printRef}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>INVOICE</div>
              <p style={{ color: "#666", marginTop: 4 }}>{invoice.invoice_number ?? invoice.id.slice(0, 8)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontWeight: 600 }}>{ownerName}</p>
              <p style={{ color: "#666", fontSize: 13 }}>{format(parseISO(invoice.created_at), "d MMMM yyyy")}</p>
              {invoice.due_date && <p style={{ color: "#666", fontSize: 13 }}>Due: {invoice.due_date}</p>}
              <span style={{ display: "inline-block", marginTop: 4, padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, textTransform: "uppercase" as const, border: "1px solid #ccc", background: "#f5f5f5" }}>
                {sb.label}
              </span>
            </div>
          </div>

          {invoice.service_type && (
            <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
              Service: <span style={{ textTransform: "capitalize" as const }}>{invoice.service_type.replace(/_/g, " ")}</span>
            </p>
          )}

          <hr style={{ border: "none", borderTop: "1px solid #e5e5e5", margin: "12px 0" }} />

          {lineItems.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f8f8" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "#666", borderBottom: "2px solid #e5e5e5" }}>Description</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#666", borderBottom: "2px solid #e5e5e5" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#666", borderBottom: "2px solid #e5e5e5" }}>Unit Price</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#666", borderBottom: "2px solid #e5e5e5" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>{li.description ?? li.pricing_key ?? "—"}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>{li.quantity}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>{formatAed(li.unit_price)}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right", fontWeight: 600 }}>{formatAed(li.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#999", padding: "16px 0" }}>No line items</p>
          )}

          <hr style={{ border: "none", borderTop: "1px solid #e5e5e5", margin: "12px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: 240 }}>
              <span style={{ color: "#666" }}>Subtotal</span>
              <span>{formatAed(invoice.subtotal_aed)}</span>
            </div>
            {invoice.discount_aed > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", width: 240 }}>
                <span style={{ color: "#666" }}>Discount ({invoice.discount_pct}%)</span>
                <span style={{ color: "#16a34a" }}>-{formatAed(invoice.discount_aed)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", width: 240, fontWeight: 700, fontSize: 18, borderTop: "2px solid #111", paddingTop: 8, marginTop: 4 }}>
              <span>Total</span>
              <span>{formatAed(invoice.total_aed)}</span>
            </div>
          </div>

          {invoice.paid_at && (
            <p style={{ marginTop: 16, fontSize: 13, color: "#16a34a" }}>
              Paid on {format(parseISO(invoice.paid_at), "d MMM yyyy")} via {invoice.payment_method ?? "—"}
            </p>
          )}
          {invoice.voided_at && (
            <p style={{ marginTop: 16, fontSize: 13, color: "#dc2626" }}>
              Voided on {format(parseISO(invoice.voided_at), "d MMM yyyy")}
              {invoice.voided_reason ? ` — ${invoice.voided_reason}` : ""}
            </p>
          )}
          {invoice.notes && (
            <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>Notes: {invoice.notes}</p>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isCredit = tx.amount > 0;
  const badge = TX_BADGE[tx.transaction_type] ?? TX_BADGE.adjustment;
  return (
    <TableRow>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {format(parseISO(tx.created_at), "d MMM yyyy, HH:mm")}
      </TableCell>
      <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
      <TableCell className="text-sm max-w-[200px] truncate" title={tx.notes ?? ""}>{tx.notes || <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className={`text-sm font-semibold tabular-nums text-right whitespace-nowrap ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
        {isCredit ? "+" : ""}{tx.amount.toFixed(2)}
      </TableCell>
      <TableCell className="text-sm tabular-nums text-right whitespace-nowrap text-muted-foreground">AED {tx.balance_after.toFixed(2)}</TableCell>
    </TableRow>
  );
}

// ── OwnerSearchBar ───────────────────────────────────────────────────────────

interface OwnerSearchBarProps {
  onSelect: (id: string, label: string) => void;
  selectedLabel: string | null;
  selectedOwnerId: string | null;
  onClear: () => void;
}

function OwnerSearchBar({ onSelect, selectedLabel, selectedOwnerId, onClear }: OwnerSearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { data: owners, isLoading } = useOwners(query.length >= 1 ? query : undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedLabel && selectedOwnerId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 max-w-lg">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <button type="button" className="flex-1 min-w-0 text-left text-sm font-medium hover:underline truncate" onClick={() => navigate(`/customers/${selectedOwnerId}`)}>
          {selectedLabel}
        </button>
        <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-muted transition-colors shrink-0" aria-label="Clear selection">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative max-w-lg">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input className="pl-9" placeholder="Search client or pet name / phone…" value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoComplete="off" />
      {open && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !owners || owners.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No clients or pets found</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y">
              {owners.map((o) => {
                const label = ownerDisplayName(o.first_name, o.last_name);
                const petNames = (o.pets ?? []).map((p) => p.name).filter(Boolean).join(", ");
                const details = [petNames, o.phone].filter(Boolean).join(" · ");
                return (
                  <li key={o.id} className="flex items-stretch">
                    <button type="button" className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 text-left transition-colors"
                      onMouseDown={(e) => { e.preventDefault(); onSelect(o.id, label); setQuery(""); setOpen(false); }}>
                      <span className="font-medium truncate">{label}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{details}</span>
                    </button>
                    <button type="button" className="shrink-0 px-3 flex items-center justify-center border-l hover:bg-muted/80 transition-colors" title="Open profile"
                      onMouseDown={(e) => { e.preventDefault(); navigate(`/customers/${o.id}`); setOpen(false); }}>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── WalletTab ────────────────────────────────────────────────────────────────

function WalletTab({ ownerId, owner }: { ownerId: string; owner: { first_name: string; last_name: string; phone: string; member_type: MemberType; wallet_balance: number; id: string } }) {
  const navigate = useNavigate();
  const { data: transactions, isLoading: txLoading } = useWalletTransactions(ownerId);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const balance = owner.wallet_balance;
  const isLowBalance = balance < LOW_BALANCE_THRESHOLD;

  return (
    <>
      {isLowBalance && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Low wallet balance — <strong>{formatAed(balance)}</strong>. Consider topping up.</span>
        </div>
      )}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div role="button" tabIndex={0} className="space-y-1.5 cursor-pointer rounded-lg p-1 -m-1 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => navigate(`/customers/${owner.id}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/customers/${owner.id}`); } }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{ownerDisplayName(owner.first_name, owner.last_name)}</h2>
              <Badge variant="outline" className={MEMBER_BADGE[owner.member_type]}>{owner.member_type.charAt(0).toUpperCase() + owner.member_type.slice(1)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{owner.phone}</p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:items-end">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Wallet Balance</p>
              <p className={`mt-1 text-4xl font-bold tabular-nums ${isLowBalance ? "text-amber-600" : ""}`}>{formatAed(balance)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setModalMode("topup")}>
                <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Top Up
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setModalMode("deduct")}>
                <ArrowDownCircle className="mr-1.5 h-4 w-4" /> Deduct
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Wallet className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No transactions yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[160px]">Date</TableHead>
                  <TableHead className="min-w-[140px]">Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right min-w-[100px]">Amount</TableHead>
                  <TableHead className="text-right min-w-[130px]">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {modalMode && <WalletModal open={!!modalMode} mode={modalMode} ownerId={ownerId} onClose={() => setModalMode(null)} />}
    </>
  );
}

// ── InvoicesTab ──────────────────────────────────────────────────────────────

function InvoicesTab({ ownerId, ownerName }: { ownerId: string; ownerName: string }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const finalise = useFinaliseInvoice();
  const [payInvoice, setPayInvoice] = useState<InvoiceWithItems | null>(null);
  const [voidInvoice, setVoidInvoice] = useState<InvoiceWithItems | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceWithItems | null>(null);

  const filters = statusFilter !== "all" ? { status: statusFilter as InvoiceStatus } : undefined;
  const { data: invoices = [], isLoading } = useInvoicesForOwner(ownerId, filters);

  const statement = useOwnerStatement(ownerId);

  const handleFinalise = (inv: InvoiceWithItems) => {
    finalise.mutate(inv.id, {
      onSuccess: () => toast.success(`Invoice ${inv.invoice_number ?? ""} finalised`),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      {/* Statement summary */}
      {!statement.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Wallet Balance</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{formatAed(statement.walletBalance)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Outstanding</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${statement.totalOutstanding > 0 ? "text-red-600" : ""}`}>
                {formatAed(statement.totalOutstanding)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Net Position</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${statement.netPosition < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatAed(statement.netPosition)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter + actions bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="finalised">Finalised</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="outstanding">Outstanding</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>

        {statement.totalOutstanding > 0 && (
          <Button size="sm" variant="outline" onClick={statement.payAllOutstanding}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Pay all outstanding ({formatAed(statement.totalOutstanding)})
          </Button>
        )}
      </div>

      {/* Invoice list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No invoices yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[120px]">Invoice #</TableHead>
                  <TableHead className="min-w-[100px]">Date</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right min-w-[100px]">Total</TableHead>
                  <TableHead className="text-right min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const sb = INVOICE_STATUS_BADGE[inv.status] ?? INVOICE_STATUS_BADGE.draft;
                  const canFinalise = inv.status === "draft";
                  const canPay = ["finalised", "issued", "outstanding", "overdue", "partially_paid"].includes(inv.status);
                  const canVoid = !["cancelled", "voided", "paid"].includes(inv.status);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setViewInvoice(inv)}>
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseISO(inv.created_at), "d MMM yyyy")}</TableCell>
                      <TableCell className="text-sm capitalize">{inv.service_type?.replace(/_/g, " ") ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={sb.className}>{sb.label}</Badge></TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-right">{formatAed(inv.total_aed)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setViewInvoice(inv)} title="View invoice">
                            <Eye className="mr-1 h-3.5 w-3.5" /> View
                          </Button>
                          {canFinalise && (
                            <Button size="sm" variant="outline" disabled={finalise.isPending} onClick={() => handleFinalise(inv)}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Finalise
                            </Button>
                          )}
                          {canPay && (
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPayInvoice(inv)}>
                              <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                            </Button>
                          )}
                          {canVoid && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setVoidInvoice(inv)}>
                              <Ban className="mr-1 h-3.5 w-3.5" /> Void
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaymentDialog open={!!payInvoice} invoice={payInvoice} onClose={() => setPayInvoice(null)} />
      <VoidDialog open={!!voidInvoice} invoice={voidInvoice} ownerId={ownerId} onClose={() => setVoidInvoice(null)} />
      <InvoiceDetailDialog open={!!viewInvoice} invoice={viewInvoice} ownerName={ownerName} onClose={() => setViewInvoice(null)} />
    </>
  );
}

// ── PricingTab ───────────────────────────────────────────────────────────────

function PricingTab() {
  const {
    groomingRates, parkRates, daycarePackageTypes, addonRates,
    updateGroomingRate, updateParkRate, updateDaycareType, updateAddonRate,
    isLoading,
  } = useServiceRates();
  const [saving, setSaving] = useState<string | null>(null);

  const saveRate = async (type: string, id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setSaving(id);
    try {
      if (type === "grooming") await updateGroomingRate(id, num);
      else if (type === "park") await updateParkRate(id, num);
      else if (type === "daycare") await updateDaycareType(id, num);
      else if (type === "addon") await updateAddonRate(id, num);
      toast.success("Rate saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Service rates are used to auto-price bookings. Press Enter or blur to save.</p>

      {/* Grooming Rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming Services</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Service</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groomingRates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min="0" step="1"
                      className="w-[120px] ml-auto text-right h-8 text-sm"
                      defaultValue={r.price_aed}
                      onBlur={(e) => saveRate("grooming", r.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === r.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Park Rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Park</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Slot Type</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parkRates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min="0" step="1"
                      className="w-[120px] ml-auto text-right h-8 text-sm"
                      defaultValue={r.price_per_slot_aed}
                      onBlur={(e) => saveRate("park", r.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === r.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daycare Package Types */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Daycare Packages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Package</TableHead>
                <TableHead className="text-center w-20">Days</TableHead>
                <TableHead className="text-right min-w-[140px]">Base Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daycarePackageTypes.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.name}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{t.total_days}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min="0" step="1"
                      className="w-[120px] ml-auto text-right h-8 text-sm"
                      defaultValue={t.base_price_aed}
                      onBlur={(e) => saveRate("daycare", t.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === t.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add-on Rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons (Transport, Grooming on Boarding)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Add-on</TableHead>
                <TableHead className="w-20">Unit</TableHead>
                <TableHead className="min-w-[120px]">Applies to</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addonRates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.applicable_services.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min="0" step="1"
                      className="w-[120px] ml-auto text-right h-8 text-sm"
                      defaultValue={r.price_aed}
                      onBlur={(e) => saveRate("addon", r.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === r.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const BillingPage = () => {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("wallet");

  const { data: owner, isLoading: ownerLoading } = useOwner(selectedOwnerId ?? "");

  const handleSelect = (id: string, label: string) => { setSelectedOwnerId(id); setSelectedLabel(label); };
  const handleClear = () => { setSelectedOwnerId(null); setSelectedLabel(null); };

  return (
    <>
      <TopBar title="Billing & Wallets" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Owner</p>
          <OwnerSearchBar onSelect={handleSelect} selectedLabel={selectedLabel} selectedOwnerId={selectedOwnerId} onClear={handleClear} />
        </div>

        {!selectedOwnerId && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="wallet"><Wallet className="mr-1.5 h-4 w-4" /> Wallet</TabsTrigger>
              <TabsTrigger value="pricing"><Receipt className="mr-1.5 h-4 w-4" /> Pricing</TabsTrigger>
            </TabsList>
            <TabsContent value="wallet" className="mt-6">
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Wallet className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Search for an owner above to view their wallet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Type a name or phone number to get started</p>
              </div>
            </TabsContent>
            <TabsContent value="pricing" className="mt-6">
              <PricingTab />
            </TabsContent>
          </Tabs>
        )}

        {selectedOwnerId && (
          <>
            {ownerLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : owner ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="wallet"><Wallet className="mr-1.5 h-4 w-4" /> Wallet</TabsTrigger>
                  <TabsTrigger value="invoices"><FileText className="mr-1.5 h-4 w-4" /> Invoices</TabsTrigger>
                  <TabsTrigger value="pricing"><Receipt className="mr-1.5 h-4 w-4" /> Pricing</TabsTrigger>
                </TabsList>
                <TabsContent value="wallet" className="mt-6 space-y-6">
                  <WalletTab ownerId={selectedOwnerId} owner={owner} />
                </TabsContent>
                <TabsContent value="invoices" className="mt-6 space-y-6">
                  <InvoicesTab ownerId={selectedOwnerId} ownerName={ownerDisplayName(owner.first_name, owner.last_name)} />
                </TabsContent>
                <TabsContent value="pricing" className="mt-6">
                  <PricingTab />
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-muted-foreground">Owner not found.</p>
            )}
          </>
        )}
      </main>
    </>
  );
};

export default BillingPage;
