import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useInvoiceDetail } from "@/hooks/useInvoiceDetail";
import { useLinkedDaycareSessionsForInvoice } from "@/hooks/useDaycare";
import { useCancellationRefundPreview } from "@/hooks/useCancellationRefund";
import { useProcessWalletPayment, useRecordCashOrCardPayment } from "@/hooks/usePayments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { invoiceDisplayTotals, vatLineLabel } from "@/lib/vatConfig";
import { DeleteInvoiceDialog } from "@/components/billing/DeleteInvoiceDialog";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  finalised: "bg-blue-50 text-blue-700 border-blue-300",
  outstanding: "bg-amber-50 text-amber-700 border-amber-300",
  overdue: "bg-red-50 text-red-700 border-red-300",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-300",
  voided: "bg-slate-100 text-slate-500 border-slate-300 line-through",
};

function aed(v: number) {
  return `AED ${v.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function InvoiceDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useInvoiceDetail(id);
  const walletPay = useProcessWalletPayment();
  const cashCardPay = useRecordCashOrCardPayment();

  const [walletOpen, setWalletOpen] = useState(false);
  const [cashCardOpen, setCashCardOpen] = useState<"cash" | "card" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [serviceStart, setServiceStart] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");
  const [refundNote, setRefundNote] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState("discount_override");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustApprover, setAdjustApprover] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refundPreview = useCancellationRefundPreview(
    data?.invoice?.owner_id,
    data?.invoice?.id,
    serviceStart || undefined,
  );

  const isDaycareInvoice = data?.invoice?.service_type === "daycare";
  const { data: linkedDaycareSessions = [] } = useLinkedDaycareSessionsForInvoice(
    isDaycareInvoice ? data?.invoice?.id : undefined,
    isDaycareInvoice ? data?.invoice?.service_id ?? undefined : undefined,
  );

  const computed = useMemo(() => {
    const lines = data?.lines ?? [];
    const adjustments = data?.adjustments ?? [];
    const invoice = data?.invoice;
    const lineSubtotal = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
    const lineTotal = lines.reduce((sum, l) => sum + (l.total_price ?? l.line_total ?? 0), 0);
    const lineDiscount = Math.max(0, lineSubtotal - lineTotal);
    const adjustmentDiscount = adjustments.reduce(
      (sum, a) => sum + Math.abs(a.adjusted_amount ?? 0),
      0,
    );
    const totalDiscount = lineDiscount + adjustmentDiscount + (invoice?.discount_aed ?? 0);
    const money = invoice
      ? invoiceDisplayTotals({
          total: invoice.total,
          total_aed: invoice.total_aed,
          vat_aed: invoice.vat_aed,
        })
      : { netExVat: 0, vat: 0, grandTotal: 0 };
    const amountPaid = (data?.payments ?? []).reduce((sum, p) => sum + Math.max(0, p.amount), 0);
    const outstanding = Math.max(0, money.grandTotal - amountPaid);
    return {
      lineSubtotal,
      totalDiscount,
      netExVat: money.netExVat,
      vat: money.vat,
      grandTotal: money.grandTotal,
      amountPaid,
      outstanding,
    };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <TopBar title="Invoice Detail" />
        <main className="flex-1 overflow-auto p-8 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
        </main>
      </>
    );
  }

  if (!data?.invoice) {
    return (
      <>
        <TopBar title="Invoice Detail" />
        <main className="flex-1 overflow-auto p-8">
          <p className="text-muted-foreground">Invoice not found.</p>
        </main>
      </>
    );
  }

  const inv = data.invoice;
  const ownerName = `${inv.owners?.first_name ?? ""} ${inv.owners?.last_name ?? ""}`.trim() || "—";
  const status = inv.status;

  const doFinalise = async () => {
    const { error } = await supabase.from("invoices").update({ status: "finalised" }).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Invoice finalised.");
    refetch();
  };

  const doVoid = async () => {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "voided", voided_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Invoice voided.");
    refetch();
  };

  const doRecordCashOrCard = async () => {
    if (!cashCardOpen) return;
    if (!performedBy.trim()) return toast.error("Staff name is required.");
    try {
      await cashCardPay.mutateAsync({
        invoiceId: inv.id,
        method: cashCardOpen,
        performedBy: performedBy.trim(),
        note: refundNote.trim() || undefined,
      });
      toast.success(`Recorded ${cashCardOpen} payment.`);
      setCashCardOpen(null);
      setRefundNote("");
      setPerformedBy("");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not record payment.");
    }
  };

  const doWalletPay = async () => {
    if (!performedBy.trim()) return toast.error("Staff name is required.");
    try {
      await walletPay.mutateAsync({ invoiceId: inv.id, performedBy: performedBy.trim() });
      toast.success("Wallet payment completed.");
      setWalletOpen(false);
      setPerformedBy("");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Wallet payment failed.");
    }
  };

  const doAddAdjustment = async () => {
    if (!adjustAmount || !adjustReason.trim() || !adjustApprover.trim()) {
      return toast.error("Fill amount, reason, and approver.");
    }
    const amount = Math.abs(parseFloat(adjustAmount));
    if (!amount || Number.isNaN(amount)) return toast.error("Invalid adjustment amount.");
    const { error } = await supabase.from("billing_adjustments").insert({
      owner_id: inv.owner_id,
      invoice_id: inv.id,
      adjustment_type: adjustType,
      original_amount: inv.total_aed ?? inv.total,
      adjusted_amount: amount,
      reason: adjustReason.trim(),
      approved_by: adjustApprover.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Adjustment added.");
    setAdjustOpen(false);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustApprover("");
    refetch();
  };

  const doCancelRefund = async () => {
    const amount = parseFloat(refundAmount || "0") || 0;
    if (!performedBy.trim()) return toast.error("Staff name is required.");
    if (amount > 0) {
      const currentBalance = inv.owners?.wallet_balance ?? 0;
      const { error: txErr } = await supabase.from("wallet_transactions").insert({
        owner_id: inv.owner_id,
        invoice_id: inv.id,
        transaction_type: "refund",
        amount,
        balance_after: currentBalance + amount,
        payment_method: null,
        performed_by: performedBy.trim(),
        notes: refundNote.trim() || "Cancellation refund",
      });
      if (txErr) return toast.error(txErr.message);
    }
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "voided",
        voided_reason: refundNote.trim() || "Cancelled with refund",
        voided_at: new Date().toISOString(),
      })
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Invoice cancelled and refund recorded.");
    setCancelOpen(false);
    refetch();
  };

  return (
    <>
      <TopBar title="Invoice Detail" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <Button variant="ghost" onClick={() => navigate("/billing/invoices")}>Back to invoices</Button>

        <Card>
          <CardContent className="p-5 grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Invoice</p>
              <p className="font-mono text-sm">{inv.invoice_number ?? inv.id}</p>
              <Badge variant="outline" className={STATUS_COLOR[status] ?? STATUS_COLOR.draft}>{status.replace(/_/g, " ")}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Owner</p>
              <Link to={`/customers/${inv.owner_id}`} className="font-medium text-primary hover:underline">{ownerName}</Link>
              <p className="text-sm text-muted-foreground capitalize">{inv.service_type?.replace(/_/g, " ") ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                Created {format(new Date(inv.created_at), "d MMM yyyy")} · Due {inv.due_date ? format(new Date(`${inv.due_date}T00:00:00`), "d MMM yyyy") : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {inv.notes?.trim() ? (
          <Card>
            <CardContent className="p-5 space-y-1">
              <h3 className="font-semibold text-sm">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{inv.notes}</p>
            </CardContent>
          </Card>
        ) : null}

        {isDaycareInvoice && linkedDaycareSessions.length > 0 && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <h3 className="font-semibold text-sm">Linked daycare check-ins</h3>
              <p className="text-xs text-muted-foreground">
                Dogs on this invoice (including hourly family billing marked on each session).
              </p>
              <ul className="text-sm space-y-1">
                {linkedDaycareSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      to="/daycare?tab=operations"
                      className="text-primary hover:underline"
                    >
                      {session.pet_name}
                    </Link>
                    {" — "}
                    {format(parseISO(session.session_date), "d MMM yyyy")}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow className="bg-muted/40"><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Line Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.lines.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No line items.</TableCell></TableRow>
              ) : data.lines.map((l) => {
                const raw = l.unit_price * l.quantity;
                const total = l.total_price ?? l.line_total ?? raw;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{aed(l.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{aed(Math.max(0, raw - total))}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{aed(total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Adjustments</h3>
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>Add adjustment</Button>
            </div>
            {data.adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments.</p>
            ) : (
              <div className="space-y-2">
                {data.adjustments.map((a) => (
                  <div key={a.id} className="rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="capitalize">{a.adjustment_type.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{aed(Math.abs(a.adjusted_amount ?? 0))}</span>
                    </div>
                    <p className="text-muted-foreground">{a.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <h3 className="font-semibold">Payments</h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <div className="space-y-2">
                {data.payments.map((p) => (
                  <div key={p.id} className="rounded-md border p-3 text-sm flex items-center justify-between">
                    <div>
                      <p className="capitalize">{p.payment_method ?? p.transaction_type.replace(/_/g, " ")}</p>
                      <p className="text-muted-foreground">{format(new Date(p.created_at), "d MMM yyyy, HH:mm")} · {p.performed_by ?? "—"}</p>
                    </div>
                    <span className="font-semibold tabular-nums">{aed(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 grid gap-1 text-sm md:max-w-md ml-auto">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{aed(computed.lineSubtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total discount</span><span>{aed(computed.totalDiscount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (ex VAT)</span><span>{aed(computed.netExVat)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{aed(computed.vat)}</span></div>
            <div className="flex justify-between font-semibold text-base pt-2 border-t"><span>Grand total (incl. VAT)</span><span>{aed(computed.grandTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount paid</span><span>{aed(computed.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance outstanding</span><span>{aed(computed.outstanding)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2">
            {status === "draft" && (
              <>
                <Button onClick={doFinalise}>Finalise</Button>
                <Button variant="outline">Edit line items</Button>
                <Button variant="destructive" onClick={doVoid}>Void</Button>
              </>
            )}
            {["finalised", "outstanding", "overdue", "issued", "partially_paid"].includes(status) && (
              <>
                <Button onClick={() => setWalletOpen(true)}>Pay with wallet</Button>
                <Button variant="outline" onClick={() => setCashCardOpen("cash")}>Record cash</Button>
                <Button variant="outline" onClick={() => setCashCardOpen("card")}>Record card</Button>
                <Button variant="destructive" onClick={doVoid}>Void</Button>
                <Button variant="outline" onClick={() => {
                  setServiceStart(inv.issue_date || inv.created_at.slice(0, 10));
                  setRefundAmount("0");
                  setCancelOpen(true);
                }}>Cancel & refund</Button>
              </>
            )}
            {status === "paid" && (
              <>
                <Button variant="outline" onClick={() => window.print()}>Print receipt</Button>
                <Button variant="destructive" onClick={doVoid}>Void</Button>
              </>
            )}
            {status === "voided" && <p className="text-sm text-muted-foreground">Voided invoice is read-only.</p>}
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete invoice
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wallet payment</DialogTitle><DialogDescription>Current wallet {aed(inv.owners?.wallet_balance ?? 0)}</DialogDescription></DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (before VAT)</span><span>{aed(computed.netExVat)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{aed(computed.vat)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{aed(computed.grandTotal)}</span></div>
            </div>
            <p>Shortfall: <strong>{aed(Math.max(0, computed.grandTotal - (inv.owners?.wallet_balance ?? 0)))}</strong></p>
            <Label>Processed by</Label>
            <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Staff name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletOpen(false)}>Cancel</Button>
            <Button onClick={doWalletPay} disabled={walletPay.isPending}>{walletPay.isPending ? "Processing..." : "Confirm payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cashCardOpen} onOpenChange={() => setCashCardOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record {cashCardOpen} payment</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (before VAT)</span><span>{aed(computed.netExVat)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{aed(computed.vat)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{aed(computed.grandTotal)}</span></div>
            </div>
            <Label>Reference note (optional)</Label>
            <Textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
            <Label>Processed by</Label>
            <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Staff name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashCardOpen(null)}>Cancel</Button>
            <Button onClick={doRecordCashOrCard} disabled={cashCardPay.isPending}>{cashCardPay.isPending ? "Saving..." : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel & refund</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <Label>Service start date</Label>
            <Input type="date" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} />
            {refundPreview.data && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-medium">{refundPreview.data.policy_label}</p>
                <p>{refundPreview.data.hours_notice.toFixed(0)}h notice · {refundPreview.data.refund_pct}% · {aed(refundPreview.data.refund_aed)}</p>
              </div>
            )}
            <Label>Refund amount</Label>
            <Input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <Label>Note</Label>
            <Textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
            <Label>Processed by</Label>
            <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Staff name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Cancel</Button>
            <Button onClick={doCancelRefund}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteInvoiceDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        invoiceUuid={inv.id}
        invoiceNumberDisplay={inv.invoice_number?.trim() || inv.id.slice(0, 8)}
        ownerName={ownerName}
        totalAmount={computed.grandTotal}
        onDeleted={() => navigate("/billing/invoices")}
      />

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add adjustment</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Type</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
              <option value="discount_override">Discount</option>
              <option value="goodwill_credit">Goodwill credit</option>
              <option value="fee_waived">Fee waived</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <Label>Amount</Label>
            <Input type="number" min="0" step="0.01" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
            <Label>Reason</Label>
            <Textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            <Label>Approved by</Label>
            <Input value={adjustApprover} onChange={(e) => setAdjustApprover(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={doAddAdjustment}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
