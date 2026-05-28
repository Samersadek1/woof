import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { addonRateUiGroup } from "@/lib/groomingCatalog";
import GroomingPricingGrid from "@/components/billing/GroomingPricingGrid";
import GroomingPackagesGrid from "@/components/billing/GroomingPackagesGrid";
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
  type AddonRateRow,
  formatAed,
  type InvoiceStatus,
  type InvoiceWithItems,
  type PaymentMethod as BillingPaymentMethod,
  type ServiceType,
} from "@/hooks/useBilling";
import { invoiceDiscountPercent, invoiceDisplayTotals, vatLineLabel } from "@/lib/vatConfig";
import {
  INVOICE_PAYMENT_METHOD_OPTIONS,
  WALLET_TOPUP_PAYMENT_METHOD_OPTIONS,
} from "@/lib/paymentMethod";
import { canEditInvoiceLineItems } from "@/lib/invoiceRecalc";
import { AddInvoiceLineItemDialog } from "@/components/billing/AddInvoiceLineItemDialog";
import { BoardingPeakPeriodsEditor } from "@/components/billing/BoardingPeakPeriodsEditor";
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
  ScrollText,
  Plus,
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OwnerClientSearch } from "@/components/OwnerClientSearch";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useInvoiceDeletionLog } from "@/hooks/useInvoices";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type TransactionType = Database["public"]["Enums"]["transaction_type"];

const LOW_BALANCE_THRESHOLD = 500;

const TX_BADGE: Record<string, { label: string; className: string }> = {
  top_up: { label: "Top Up", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  manual_topup: { label: "Manual Top-up", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  deduction: { label: "Deduction", className: "bg-red-50 text-red-700 border-red-200" },
  membership_fee: { label: "Membership Fee", className: "bg-purple-50 text-purple-700 border-purple-200" },
  refund: { label: "Refund", className: "bg-sky-50 text-sky-700 border-sky-200" },
  adjustment: { label: "Adjustment", className: "bg-gray-100 text-gray-600 border-gray-200" },
  card_payment: { label: "Card Payment", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  cash_payment: { label: "Cash Payment", className: "bg-teal-50 text-teal-700 border-teal-200" },
  bank_transfer_payment: { label: "Bank Transfer", className: "bg-amber-50 text-amber-800 border-amber-200" },
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

const CANONICAL_PRICING_KEYS: Array<{ key: string; label: string; category: string }> = [
  { key: "registration_member", label: "Registration fee", category: "membership" },
  { key: "daycare_single_day", label: "Daycare 1 dog (single day)", category: "daycare" },
  { key: "daycare_2_dogs", label: "Daycare 2 dogs (single day)", category: "daycare" },
  { key: "daycare_3_dogs", label: "Daycare 3 dogs (single day)", category: "daycare" },
  {
    key: "daycare_family_per_dog",
    label: "Daycare family rate per dog (4+ dogs)",
    category: "daycare",
  },
  { key: "daycare_4_dogs", label: "Daycare 4 dogs (single day)", category: "daycare" },
  { key: "daycare_5_dogs", label: "Daycare 5 dogs (single day)", category: "daycare" },
  { key: "daycare_6_dogs", label: "Daycare 6 dogs (single day)", category: "daycare" },
  { key: "daycare_hourly_single_day", label: "Daycare hourly — 1 dog", category: "daycare" },
  { key: "daycare_hourly_2_dogs", label: "Daycare hourly — 2 dogs", category: "daycare" },
  { key: "daycare_hourly_3_dogs", label: "Daycare hourly — 3 dogs", category: "daycare" },
  {
    key: "daycare_hourly_family_per_dog",
    label: "Daycare hourly family rate per dog (4+ dogs)",
    category: "daycare",
  },
  { key: "daycare_hourly_4_dogs", label: "Daycare hourly — 4 dogs", category: "daycare" },
  { key: "daycare_hourly_5_dogs", label: "Daycare hourly — 5 dogs", category: "daycare" },
  { key: "daycare_hourly_6_dogs", label: "Daycare hourly — 6 dogs", category: "daycare" },
  { key: "transport_dubai_shared", label: "Transport Dubai shared", category: "transport" },
  { key: "transport_dubai", label: "Transport Dubai private", category: "transport" },
  { key: "transport_abudhabi", label: "Transport Other Emirates", category: "transport" },
];

const MEMBERSHIP_DISCOUNT_KEYS: Array<{ tier: "Standard" | "Silver" | "Gold" | "Platinum"; key: string; defaultPct: number }> = [
  { tier: "Standard", key: "", defaultPct: 0 },
  { tier: "Silver", key: "membership_discount_silver", defaultPct: 10 },
  { tier: "Gold", key: "membership_discount_gold", defaultPct: 20 },
  { tier: "Platinum", key: "membership_discount_platinum", defaultPct: 30 },
];

const GROOMING_SERVICE_RATE_CARD_KEYS: Record<string, string> = {
  full_groom: "grooming_grande_s",
  full_bath: "grooming_full_bath",
  nail_clip: "grooming_nail_clip",
  deshedding: "grooming_deshed_smooth_s",
  pawdicure: "grooming_pawdicure",
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
                {WALLET_TOPUP_PAYMENT_METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
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

  const pay = invoiceDisplayTotals({
    total: invoice.total,
    total_aed: invoice.total_aed,
    vat_aed: invoice.vat_aed,
    service_type: invoice.service_type,
    notes: invoice.notes,
  });

  const handlePay = async () => {
    if (!staffName.trim()) { toast.error("Enter staff name"); return; }
    try {
      await processPayment.mutateAsync({
        invoiceId: invoice.id,
        method,
        staffName: staffName.trim(),
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed.");
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
            Invoice {invoice.invoice_number ?? invoice.id.slice(0, 8)} — {formatAed(pay.grandTotal)} incl. VAT
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (before VAT)</span><span>{formatAed(pay.netExVat)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{formatAed(pay.vat)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{formatAed(pay.grandTotal)}</span></div>
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as BillingPaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_PAYMENT_METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
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
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" disabled={processPayment.isPending} onClick={handlePay}>
            {processPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {formatAed(pay.grandTotal)}
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
            Invoice {invoice.invoice_number ?? invoice.id.slice(0, 8)} —{" "}
            {formatAed(
              invoiceDisplayTotals({
                total: invoice.total,
                total_aed: invoice.total_aed,
                vat_aed: invoice.vat_aed,
                service_type: invoice.service_type,
                notes: invoice.notes,
              }).grandTotal,
            )}{" "}
            incl. VAT
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
  ownerId,
  onClose,
  onInvoiceUpdated,
}: {
  open: boolean;
  invoice: InvoiceWithItems | null;
  ownerName: string;
  ownerId?: string;
  onClose: () => void;
  onInvoiceUpdated?: () => void;
}) {
  const [addLineOpen, setAddLineOpen] = useState(false);
  const handlePrint = useCallback(() => {
    if (!invoice) return;
    window.open(
      `/print/invoice/${invoice.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [invoice]);

  if (!invoice) return null;

  const view = invoiceDisplayTotals({
    total: invoice.total,
    total_aed: invoice.total_aed,
    vat_aed: invoice.vat_aed,
    service_type: invoice.service_type,
    notes: invoice.notes,
  });

  const sb = INVOICE_STATUS_BADGE[invoice.status] ?? INVOICE_STATUS_BADGE.draft;
  const lineItems = invoice.line_items ?? [];

  return (
    <>
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

        <div>
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
                <span style={{ color: "#666" }}>
                  Discount ({invoiceDiscountPercent({
                    subtotal: invoice.subtotal_aed,
                    subtotal_aed: invoice.subtotal_aed,
                    discount_amount: invoice.discount_aed,
                    discount_aed: invoice.discount_aed,
                  })}%)
                </span>
                <span style={{ color: "#16a34a" }}>-{formatAed(invoice.discount_aed)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", width: 240 }}>
              <span style={{ color: "#666" }}>Subtotal (ex VAT)</span>
              <span>{formatAed(view.netExVat)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: 240 }}>
              <span style={{ color: "#666" }}>{vatLineLabel()}</span>
              <span>{formatAed(view.vat)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: 240, fontWeight: 700, fontSize: 18, borderTop: "2px solid #111", paddingTop: 8, marginTop: 4 }}>
              <span>Grand total (incl. VAT)</span>
              <span>{formatAed(view.grandTotal)}</span>
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

        <DialogFooter className="gap-2 pt-4 flex-wrap">
          {ownerId && invoice && canEditInvoiceLineItems(invoice.status) && (
            <Button variant="secondary" onClick={() => setAddLineOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add line item
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {ownerId && invoice && (
      <AddInvoiceLineItemDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        invoiceId={invoice.id}
        ownerId={ownerId}
        serviceType={invoice.service_type}
        invoiceLabel={invoice.invoice_number ?? undefined}
        onAdded={onInvoiceUpdated}
      />
    )}
    </>
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
    <OwnerClientSearch
      className="max-w-lg"
      minChars={1}
      inputTestId="billing-owner-search"
      selectedId={null}
      selectedLabel={null}
      onSelect={onSelect}
      onClear={onClear}
    />
  );
}

// ── WalletTab ────────────────────────────────────────────────────────────────

function WalletTab({ ownerId, owner }: { ownerId: string; owner: { first_name: string; last_name: string; phone: string; wallet_balance: number; id: string } }) {
  const navigate = useNavigate();
  const { data: transactions, isLoading: txLoading } = useWalletTransactions(ownerId);
  const createInvoice = useCreateInvoice();
  const { getPrice } = usePricing();
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const balance = owner.wallet_balance;
  const isLowBalance = balance < LOW_BALANCE_THRESHOLD;
  const registrationFee = getPrice("registration_member");

  const chargeRegistrationFee = () => {
    const amount = registrationFee;
    if (!amount || amount <= 0) {
      toast.error("Registration fee is not configured in pricing.");
      return;
    }
    createInvoice.mutate({
      ownerId,
      serviceType: "membership",
      breakdown: {
        lineItems: [{
          pricingKey: "registration_member",
          label: "Member registration fee",
          quantity: 1,
          unitPrice: amount,
          total: amount,
        }],
        subtotal: amount,
        discountPct: 0,
        discountAed: 0,
        total: amount,
        memberType: "none",
      },
      notes: "Registration fee",
    }, {
      onSuccess: () => toast.success("Registration fee draft invoice created."),
      onError: (err) => toast.error(err.message || "Failed to create registration fee invoice."),
    });
  };

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
              <Badge variant="outline">Woof</Badge>
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
              <Button
                size="sm"
                variant="outline"
                onClick={chargeRegistrationFee}
                disabled={createInvoice.isPending}
                title="Create membership registration invoice"
              >
                {createInvoice.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Charge registration
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Legacy `boarding_*` pricing rows may still exist in the database for backwards compatibility.
        Current boarding billing resolves by room `pricing_category` / `room_type` keys (for example `royal_single`, `family_family`).
      </div>

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
  const { data: invoices = [], isLoading, refetch: refetchInvoices } = useInvoicesForOwner(ownerId, filters);

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
                  <TableHead>Branch</TableHead>
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
                      <TableCell>
                        {inv.branch_code ? (
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {inv.branch_code}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseISO(inv.created_at), "d MMM yyyy")}</TableCell>
                      <TableCell className="text-sm capitalize">{inv.service_type?.replace(/_/g, " ") ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={sb.className}>{sb.label}</Badge></TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-right">
                        {formatAed(
                          invoiceDisplayTotals({
                            total: inv.total,
                            total_aed: inv.total_aed,
                            vat_aed: inv.vat_aed,
                            service_type: inv.service_type,
                            notes: inv.notes,
                          }).grandTotal,
                        )}
                      </TableCell>
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
      <InvoiceDetailDialog
        open={!!viewInvoice}
        invoice={viewInvoice}
        ownerName={ownerName}
        ownerId={ownerId}
        onClose={() => setViewInvoice(null)}
        onInvoiceUpdated={() => {
          void refetchInvoices().then(({ data }) => {
            if (!viewInvoice) return;
            const fresh = data?.find((i) => i.id === viewInvoice.id);
            if (fresh) setViewInvoice(fresh);
          });
        }}
      />
    </>
  );
}

// ── PricingTab ───────────────────────────────────────────────────────────────

type RateCardRow = {
  key: string;
  label: string;
  category: string;
  amount_aed: number;
  inDb: boolean;
};

const EMPTY_NEW_PRICING_ITEM = {
  label: "",
  key: "",
  category: "",
  amount_aed: "",
};

const EMPTY_NEW_DAYCARE_PACKAGE = {
  name: "",
  total_days: "",
  base_price_aed: "",
};

function PricingTab() {
  const { allRows, upsertPricingPrice, createPricingItem, deletePricingItem } = usePricing();
  const {
    groomingRates, daycarePackageTypes, addonRates,
    updateGroomingRate, updateDaycarePackageType, createDaycarePackageType, updateAddonRate,
    isLoading,
  } = useServiceRates();
  const [saving, setSaving] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_NEW_PRICING_ITEM);
  const [adding, setAdding] = useState(false);
  const [addPackageOpen, setAddPackageOpen] = useState(false);
  const [addPackageForm, setAddPackageForm] = useState(EMPTY_NEW_DAYCARE_PACKAGE);
  const [addingPackage, setAddingPackage] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packageEditDraft, setPackageEditDraft] = useState({
    name: "",
    total_days: "",
    base_price_aed: "",
  });
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const activeDaycarePackageTypes = useMemo(
    () =>
      daycarePackageTypes
        .filter((t) => t.is_active)
        .sort((a, b) => a.total_days - b.total_days || a.name.localeCompare(b.name)),
    [daycarePackageTypes],
  );
  const boardingRateRows = useMemo(
    () =>
      (allRows ?? [])
        .filter((r) => r.category === "boarding")
        .sort((a, b) => a.key.localeCompare(b.key)),
    [allRows],
  );

  const boardingNightSeasonRows = useMemo(() => {
    const isBoardingNight = (key: string) => key.startsWith("boarding_night:");
    const seasonOf = (key: string) => {
      const part = key.split(":")[3];
      return part && part !== "*" ? part : null;
    };
    const nightRows = boardingRateRows.filter((r) => isBoardingNight(r.key));
    const peak = nightRows.find((r) => seasonOf(r.key) === "peak");
    const offPeak = nightRows.find((r) => seasonOf(r.key) === "off_peak");
    const other = nightRows.filter((r) => {
      const s = seasonOf(r.key);
      return s !== "peak" && s !== "off_peak";
    });
    const nonNight = boardingRateRows.filter((r) => !isBoardingNight(r.key));
    return { peak, offPeak, other, nonNight };
  }, [boardingRateRows]);
  const groomingRateCardRows = useMemo(
    () =>
      (allRows ?? [])
        .filter((r) => r.category === "grooming")
        .sort((a, b) => a.key.localeCompare(b.key)),
    [allRows],
  );
  const canonicalByKey = useMemo(
    () => new Map((allRows ?? []).map((r) => [r.key, r])),
    [allRows],
  );
  const rateCardRows = useMemo((): RateCardRow[] => {
    const byKey = new Map((allRows ?? []).map((r) => [r.key, r]));
    const rows: RateCardRow[] = [];
    for (const c of CANONICAL_PRICING_KEYS) {
      if (c.category === "park") continue;
      const live = byKey.get(c.key);
      rows.push({
        key: c.key,
        label: live?.label ?? c.label,
        category: live?.category ?? c.category,
        amount_aed: live?.amount_aed ?? 0,
        inDb: !!live,
      });
    }
    for (const r of allRows ?? []) {
      if (r.category === "park" || r.key.startsWith("park_")) continue;
      if (!CANONICAL_PRICING_KEYS.some((c) => c.key === r.key)) {
        rows.push({
          key: r.key,
          label: r.label,
          category: r.category,
          amount_aed: r.amount_aed,
          inDb: true,
        });
      }
    }
    return rows;
  }, [allRows]);
  const filteredRateCardRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rateCardRows;
    return rateCardRows.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.key.toLowerCase().includes(q),
    );
  }, [rateCardRows, searchQuery]);

  const { groomingAddOnRates, transportAddOnRates, boardingAddOnRates, otherAddOnRates } = useMemo(() => {
    const grooming: AddonRateRow[] = [];
    const transport: AddonRateRow[] = [];
    const boarding: AddonRateRow[] = [];
    const other: AddonRateRow[] = [];
    for (const r of addonRates) {
      const g = addonRateUiGroup(r);
      if (g === "grooming") grooming.push(r);
      else if (g === "transport") {
        if (r.addon_type.startsWith("transport_")) transport.push(r);
        else boarding.push(r);
      }
      else other.push(r);
    }
    return {
      groomingAddOnRates: grooming,
      transportAddOnRates: transport,
      boardingAddOnRates: boarding,
      otherAddOnRates: other,
    };
  }, [addonRates]);

  const saveRate = async (type: string, id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setSaving(id);
    try {
      if (type === "grooming") await updateGroomingRate(id, num);
      else if (type === "addon") await updateAddonRate(id, num);
      toast.success("Rate saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveCanonicalKey = async (
    key: string,
    value: string,
    meta: { label: string; category: string },
  ) => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) return;
    setSaving(`key:${key}`);
    try {
      await upsertPricingPrice({ key, label: meta.label, category: meta.category, amount_aed: num });
      toast.success("Rate card key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const handleAddPricingItem = async () => {
    const label = addForm.label.trim();
    const key = addForm.key.trim();
    const category = addForm.category.trim();
    const amount = parseFloat(addForm.amount_aed);
    if (!label || !key || !category) {
      toast.error("Item name, key, and category are required.");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid price (0 or greater).");
      return;
    }
    if (canonicalByKey.has(key)) {
      toast.error("This key already exists. Edit the existing row or choose a different key.");
      return;
    }
    setAdding(true);
    try {
      await createPricingItem({ key, label, category, amount_aed: amount });
      setAddForm(EMPTY_NEW_PRICING_ITEM);
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add pricing item");
    } finally {
      setAdding(false);
    }
  };

  const startPackageEdit = (t: (typeof activeDaycarePackageTypes)[number]) => {
    setEditingPackageId(t.id);
    setPackageEditDraft({
      name: t.name,
      total_days: String(t.total_days),
      base_price_aed: String(t.base_price_aed),
    });
  };

  const cancelPackageEdit = () => {
    setEditingPackageId(null);
    setPackageEditDraft({ name: "", total_days: "", base_price_aed: "" });
  };

  const handleSavePackageEdit = async () => {
    if (!editingPackageId) return;
    const name = packageEditDraft.name.trim();
    const totalDays = parseInt(packageEditDraft.total_days, 10);
    const basePrice = parseFloat(packageEditDraft.base_price_aed);
    if (!name) {
      toast.error("Package name is required.");
      return;
    }
    if (!Number.isInteger(totalDays) || totalDays < 1) {
      toast.error("Enter a valid number of days (1 or greater).");
      return;
    }
    if (Number.isNaN(basePrice) || basePrice < 0) {
      toast.error("Enter a valid base price (0 or greater).");
      return;
    }
    setSaving(editingPackageId);
    try {
      await updateDaycarePackageType(editingPackageId, {
        name,
        total_days: totalDays,
        base_price_aed: basePrice,
      });
      toast.success("Package updated");
      cancelPackageEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const handleAddDaycarePackage = async () => {
    const name = addPackageForm.name.trim();
    const totalDays = parseInt(addPackageForm.total_days, 10);
    const basePrice = parseFloat(addPackageForm.base_price_aed);
    if (!name) {
      toast.error("Package name is required.");
      return;
    }
    if (!Number.isInteger(totalDays) || totalDays < 1) {
      toast.error("Enter a valid number of days (1 or greater).");
      return;
    }
    if (Number.isNaN(basePrice) || basePrice < 0) {
      toast.error("Enter a valid base price (0 or greater).");
      return;
    }
    setAddingPackage(true);
    try {
      await createDaycarePackageType({ name, total_days: totalDays, base_price_aed: basePrice });
      setAddPackageForm(EMPTY_NEW_DAYCARE_PACKAGE);
      setAddPackageOpen(false);
      toast.success("Daycare package type added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add package");
    } finally {
      setAddingPackage(false);
    }
  };

  const handleDeletePricingItem = async () => {
    if (!pendingDeleteKey) return;
    setDeletingKey(pendingDeleteKey);
    try {
      await deletePricingItem(pendingDeleteKey);
      setPendingDeleteKey(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete pricing item");
    } finally {
      setDeletingKey(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Service rates are used to auto-price bookings. Press Enter or blur to save.</p>
      <Tabs defaultValue="core" className="space-y-4">
        <TabsList>
          <TabsTrigger value="core">Core Pricing</TabsTrigger>
          <TabsTrigger value="grooming-v2">Grooming (v2)</TabsTrigger>
        </TabsList>

        <TabsContent value="core" className="mt-0 space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Live Rate Card (pricing table)</CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                These keys drive live billing for transport, daycare day-pass, daycare hourly, and registration. Press Enter or blur to save price changes.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[220px]">
                  <div className="flex items-center gap-2">
                    Item
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search…"
                      className="h-7 w-28 text-xs"
                      aria-label="Search rate card items"
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[120px]">Key</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
                <TableHead className="w-[72px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRateCardRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-sm">{row.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.key}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      className="w-[140px] ml-auto text-right h-8 text-sm"
                      defaultValue={row.amount_aed}
                      onBlur={(e) => saveCanonicalKey(row.key, e.target.value, { label: row.label, category: row.category })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === `key:${row.key}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.inDb ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDeleteKey(row.key)}
                        disabled={deletingKey === row.key}
                        aria-label={`Delete ${row.label}`}
                      >
                        {deletingKey === row.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddForm(EMPTY_NEW_PRICING_ITEM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add pricing item</DialogTitle>
            <DialogDescription>
              Creates a new row in the pricing table. Changes are saved immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-label">Item name</Label>
              <Input
                id="pricing-add-label"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Weekend daycare surcharge"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-key">Key</Label>
              <Input
                id="pricing-add-key"
                value={addForm.key}
                onChange={(e) => setAddForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="e.g. daycare_weekend_surcharge"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-category">Category</Label>
              <select id="pricing-add-category" value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"><option value="" disabled>Select category…</option><option value="boarding">boarding</option><option value="grooming">grooming</option><option value="transport">transport</option><option value="daycare">daycare</option><option value="membership">membership</option><option value="rule">rule</option></select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-price">Price (AED)</Label>
              <Input
                id="pricing-add-price"
                type="number"
                min="0"
                step="0.001"
                value={addForm.amount_aed}
                onChange={(e) => setAddForm((f) => ({ ...f, amount_aed: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddPricingItem} disabled={adding}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDeleteKey}
        onOpenChange={(open) => { if (!open) setPendingDeleteKey(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pricing item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className="font-mono text-foreground">{pendingDeleteKey}</span>{" "}
              from the pricing table. Billing that references this key may break until it is re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingKey}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingKey}
              onClick={(e) => { e.preventDefault(); void handleDeletePricingItem(); }}
            >
              {deletingKey ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Membership Discounts</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Live policy used by invoices via `apply_member_discount` (database function).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Tier</TableHead>
                <TableHead className="text-right min-w-[140px]">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MEMBERSHIP_DISCOUNT_KEYS.map((row) => {
                const live = row.key ? canonicalByKey.get(row.key) : null;
                return (
                  <TableRow key={row.tier}>
                    <TableCell className="text-sm">{row.tier}</TableCell>
                    <TableCell className="text-right">
                      {row.key ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[120px] ml-auto text-right h-8 text-sm"
                          defaultValue={live?.amount_aed ?? row.defaultPct}
                          onBlur={(e) => saveCanonicalKey(row.key, e.target.value, {
                            label: live?.label ?? `${row.tier} membership discount`,
                            category: live?.category ?? "membership",
                          })}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          disabled={saving === `key:${row.key}`}
                        />
                      ) : (
                        <span className="text-sm font-medium">0%</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Boarding Rates</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Peak and off-peak night rates apply per billed night based on the peak calendar below.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[220px]">Label</TableHead>
                <TableHead className="min-w-[180px]">Key</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardingRateRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground py-6 text-center">
                    No boarding pricing keys found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {boardingNightSeasonRows.peak ? (
                    <TableRow key={boardingNightSeasonRows.peak.key}>
                      <TableCell className="text-sm font-medium">Boarding — Peak (per night)</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {boardingNightSeasonRows.peak.key}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={boardingNightSeasonRows.peak.amount_aed}
                          onBlur={(e) =>
                            saveCanonicalKey(boardingNightSeasonRows.peak!.key, e.target.value, {
                              label: boardingNightSeasonRows.peak!.label || "Boarding (per night)",
                              category: boardingNightSeasonRows.peak!.category,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${boardingNightSeasonRows.peak.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {boardingNightSeasonRows.offPeak ? (
                    <TableRow key={boardingNightSeasonRows.offPeak.key}>
                      <TableCell className="text-sm font-medium">Boarding — Off-peak (per night)</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {boardingNightSeasonRows.offPeak.key}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={boardingNightSeasonRows.offPeak.amount_aed}
                          onBlur={(e) =>
                            saveCanonicalKey(boardingNightSeasonRows.offPeak!.key, e.target.value, {
                              label: boardingNightSeasonRows.offPeak!.label || "Boarding (per night)",
                              category: boardingNightSeasonRows.offPeak!.category,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${boardingNightSeasonRows.offPeak.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {[...boardingNightSeasonRows.other, ...boardingNightSeasonRows.nonNight].map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-sm">{row.label || row.key}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.key}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={row.amount_aed}
                          onBlur={(e) => saveCanonicalKey(row.key, e.target.value, {
                            label: row.label || row.key,
                            category: row.category,
                          })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${row.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
          <BoardingPeakPeriodsEditor />
        </CardContent>
      </Card>

      {/* Grooming Rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming Services (Legacy v1)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Default service prices are pinned to the live rate card keys below. Brushing has no dedicated rate-card key and remains from `grooming_service_rates`.
          </p>
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
                    {(() => {
                      const key = GROOMING_SERVICE_RATE_CARD_KEYS[r.service];
                      const live = key ? canonicalByKey.get(key) : null;
                      return (
                    <Input
                      type="number" min="0" step="0.001"
                      className="w-[120px] ml-auto text-right h-8 text-sm"
                      defaultValue={live?.amount_aed ?? r.price_aed}
                      onBlur={(e) => {
                        if (key) {
                          saveCanonicalKey(key, e.target.value, {
                            label: live?.label ?? r.label,
                            category: live?.category ?? "grooming",
                          });
                        } else {
                          saveRate("grooming", r.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === r.id || (key ? saving === `key:${key}` : false)}
                    />
                      );
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming Rate Card (Size Tiers & Packages)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Full grooming catalog from `pricing` category `grooming` (Grande, Bijoux, Deshed long/smooth, and extras).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[220px]">Label</TableHead>
                <TableHead className="min-w-[180px]">Key</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groomingRateCardRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground py-6 text-center">
                    No grooming pricing keys found.
                  </TableCell>
                </TableRow>
              ) : (
                groomingRateCardRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-sm">{row.label || row.key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.key}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        className="w-[140px] ml-auto text-right h-8 text-sm"
                        defaultValue={row.amount_aed}
                        onBlur={(e) => saveCanonicalKey(row.key, e.target.value, {
                          label: row.label || row.key,
                          category: row.category,
                        })}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        disabled={saving === `key:${row.key}`}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daycare Package Types */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Daycare Packages</CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                Package types sold as multi-day bundles. Single-day daycare billing uses the Rate Card keys above (`daycare_*`).
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setAddPackageOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Package
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Package</TableHead>
                <TableHead className="text-center w-20">Days</TableHead>
                <TableHead className="text-right min-w-[140px]">Base Price (AED)</TableHead>
                <TableHead className="w-[88px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeDaycarePackageTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground py-6 text-center">
                    No active package types found.
                  </TableCell>
                </TableRow>
              ) : (
                activeDaycarePackageTypes.map((t) => {
                  const isEditing = editingPackageId === t.id;
                  return (
                  <TableRow key={t.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={packageEditDraft.name}
                          onChange={(e) => setPackageEditDraft((d) => ({ ...d, name: e.target.value }))}
                          className="h-8 text-sm"
                          disabled={saving === t.id}
                        />
                      ) : (
                        <span className="text-sm">{t.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={packageEditDraft.total_days}
                          onChange={(e) => setPackageEditDraft((d) => ({ ...d, total_days: e.target.value }))}
                          className="h-8 text-sm text-center w-20 mx-auto"
                          disabled={saving === t.id}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{t.total_days}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={packageEditDraft.base_price_aed}
                          onChange={(e) => setPackageEditDraft((d) => ({ ...d, base_price_aed: e.target.value }))}
                          className="w-[120px] ml-auto text-right h-8 text-sm"
                          disabled={saving === t.id}
                        />
                      ) : (
                        <span className="text-sm tabular-nums">{t.base_price_aed}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                            onClick={handleSavePackageEdit}
                            disabled={saving === t.id}
                            aria-label="Save package"
                          >
                            {saving === t.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={cancelPackageEdit}
                            disabled={saving === t.id}
                            aria-label="Cancel edit"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => startPackageEdit(t)}
                          disabled={editingPackageId !== null && editingPackageId !== t.id}
                          aria-label={`Edit ${t.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming Packages</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Multi-session grooming bundles (Summer Splash, Full Service, Yearly). Per-session grooming rates use the grids above.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <GroomingPackagesGrid />
        </CardContent>
      </Card>

      <Dialog
        open={addPackageOpen}
        onOpenChange={(open) => {
          setAddPackageOpen(open);
          if (!open) setAddPackageForm(EMPTY_NEW_DAYCARE_PACKAGE);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add daycare package</DialogTitle>
            <DialogDescription>
              Adds a daycare package definition entry. It appears in the table immediately after save.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="daycare-package-add-name">Name</Label>
              <Input
                id="daycare-package-add-name"
                value={addPackageForm.name}
                onChange={(e) => setAddPackageForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 12-Day Package"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="daycare-package-add-days">Total days</Label>
              <Input
                id="daycare-package-add-days"
                type="number"
                min="1"
                step="1"
                value={addPackageForm.total_days}
                onChange={(e) => setAddPackageForm((f) => ({ ...f, total_days: e.target.value }))}
                placeholder="12"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="daycare-package-add-price">Base price (AED)</Label>
              <Input
                id="daycare-package-add-price"
                type="number"
                min="0"
                step="1"
                value={addPackageForm.base_price_aed}
                onChange={(e) => setAddPackageForm((f) => ({ ...f, base_price_aed: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddPackageOpen(false)} disabled={addingPackage}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddDaycarePackage} disabled={addingPackage}>
              {addingPackage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-on rates — split so grooming lines stay with the grooming catalog */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Grooming</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Same catalog as boarding “groom on checkout” and grooming extras. Set <code className="text-xs">applicable_services</code> to include <code className="text-xs">grooming</code> in Supabase to classify new rows.
          </p>
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
              {groomingAddOnRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground py-6 text-center">No grooming add-on rows (or all classified as transport).</TableCell>
                </TableRow>
              ) : (
                groomingAddOnRates.map((r) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Boarding</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Boarding-only add-ons from `addon_rates`. Transport add-ons are hidden here to avoid stale values; live transport charges always come from Rate Card transport keys above.
          </p>
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
              {boardingAddOnRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground py-6 text-center">No boarding add-on rows.</TableCell>
                </TableRow>
              ) : (
                boardingAddOnRates.map((r) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {transportAddOnRates.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Hidden {transportAddOnRates.length} legacy transport add-on row{transportAddOnRates.length === 1 ? "" : "s"} from `addon_rates` to prevent pricing confusion. Use Rate Card keys (`transport_dubai_shared`, `transport_dubai`, `transport_abudhabi`) for live transport pricing.
        </div>
      ) : null}

      {otherAddOnRates.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Other</CardTitle>
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
                {otherAddOnRates.map((r) => (
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
      ) : null}
        </TabsContent>

        <TabsContent value="grooming-v2" className="mt-0 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming (v2) — Package × Size Grid</CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                Live 5 × 4 grid (Grande, Bijoux, Deshedding Long/Smooth, Bath & Blow across S/M/L/XL).
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <GroomingPricingGrid />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoiceDeletionLogPanel() {
  const { data: rows = [], isLoading, error } = useInvoiceDeletionLog();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice deletion log</CardTitle>
        <p className="text-sm text-muted-foreground">
          Audit trail when an invoice is deleted from the system.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Could not load deletion log.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No deletions recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Invoice ID</TableHead>
                <TableHead>Owner name</TableHead>
                <TableHead className="text-right">Total amount</TableHead>
                <TableHead>Deleted by</TableHead>
                <TableHead>Deleted at</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.invoice_id ?? "—"}</TableCell>
                  <TableCell>{r.owner_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.total_amount != null ? formatAed(r.total_amount) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs" title={r.deleted_by ?? undefined}>
                    {r.deleted_by ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.deleted_at ? format(parseISO(r.deleted_at), "d MMM yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {r.reason?.trim() ? r.reason : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const BillingPage = () => {
  const navigate = useNavigate();
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
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                <TabsTrigger value="wallet"><Wallet className="mr-1.5 h-4 w-4" /> Wallet</TabsTrigger>
                <TabsTrigger value="pricing"><Receipt className="mr-1.5 h-4 w-4" /> Pricing</TabsTrigger>
                <TabsTrigger value="deletion-log"><ScrollText className="mr-1.5 h-4 w-4" /> Deletion log</TabsTrigger>
              </TabsList>
              <Button size="sm" variant="outline" onClick={() => navigate("/billing/invoices")}>
                <FileText className="mr-1.5 h-4 w-4" /> Invoices list
              </Button>
            </div>
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
            <TabsContent value="deletion-log" className="mt-6">
              <InvoiceDeletionLogPanel />
            </TabsContent>
          </Tabs>
        )}

        {selectedOwnerId && (
          <>
            {ownerLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : owner ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex flex-wrap items-center gap-2">
                  <TabsList>
                    <TabsTrigger value="wallet"><Wallet className="mr-1.5 h-4 w-4" /> Wallet</TabsTrigger>
                    <TabsTrigger value="invoices"><FileText className="mr-1.5 h-4 w-4" /> Invoices</TabsTrigger>
                    <TabsTrigger value="pricing"><Receipt className="mr-1.5 h-4 w-4" /> Pricing</TabsTrigger>
                    <TabsTrigger value="deletion-log"><ScrollText className="mr-1.5 h-4 w-4" /> Deletion log</TabsTrigger>
                  </TabsList>
                  <Button size="sm" variant="outline" onClick={() => navigate("/billing/invoices")}>
                    Open invoices list
                  </Button>
                </div>
                <TabsContent value="wallet" className="mt-6 space-y-6">
                  <WalletTab ownerId={selectedOwnerId} owner={owner} />
                </TabsContent>
                <TabsContent value="invoices" className="mt-6 space-y-6">
                  <InvoicesTab ownerId={selectedOwnerId} ownerName={ownerDisplayName(owner.first_name, owner.last_name)} />
                </TabsContent>
                <TabsContent value="pricing" className="mt-6">
                  <PricingTab />
                </TabsContent>
                <TabsContent value="deletion-log" className="mt-6">
                  <InvoiceDeletionLogPanel />
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
