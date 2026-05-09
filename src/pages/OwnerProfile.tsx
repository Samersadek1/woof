import { useState, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format, parse, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/dashboard/TopBar";
import { useOwner, useUpdateOwner, useDeleteOwner } from "@/hooks/useOwners";
import { useOwnerBookings } from "@/hooks/useBookings";
import type { BookingWithDetails } from "@/hooks/useBookings";
import {
  useOwnerGroomingAppointments,
  type GroomingAppointmentWithJoins,
} from "@/hooks/useGrooming";
import {
  useOwnerParkBookings,
  type ParkBookingWithJoins,
} from "@/hooks/usePark";
import { calculateNights, ownerDisplayName } from "@/lib/bookingUtils";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import { boardingCalendarTo, boardingServiceLabel } from "@/lib/boardingLabels";
import { usePets, useCreatePet, getVaccinationStatus } from "@/hooks/usePets";
import { petVaccinationSummaryLine } from "@/lib/vaccinationsDisplay";
import { useDaycarePackages } from "@/hooks/useDaycare";
import { useTopUpWallet } from "@/hooks/useWallet";
import type { PetWithVaccinations } from "@/hooks/usePets";
import { PetBreedCombobox } from "@/components/PetBreedCombobox";
import { VetClinicCombobox } from "@/components/VetClinicCombobox";
import { VaccinationEditor } from "@/components/VaccinationEditor";
import type { VaccinationRow } from "@/components/VaccinationEditor";
import {
  useInvoicesForOwner,
  useOwnerStatement,
  useBillingAdjustments,
  useFinaliseInvoice,
  useProcessPayment,
  useVoidInvoice,
  formatAed,
  type InvoiceWithItems,
  type InvoiceStatus,
} from "@/hooks/useBilling";
import { invoiceDisplayTotals, vatLineLabel } from "@/lib/vatConfig";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Wallet,
  Loader2,
  PawPrint,
  Dog,
  Cat,
  Trash2,
  CalendarDays,
  AlertTriangle,
  BedDouble,
  ExternalLink,
  FileText,
  CreditCard,
  Ban,
  CheckCircle2,
  Receipt,
  Eye,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MemberType = Database["public"]["Enums"]["member_type"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type ParkSize = Database["public"]["Enums"]["park_size"];
type OwnerUpdate = Database["public"]["Tables"]["owners"]["Update"];
type PetInsert = Database["public"]["Tables"]["pets"]["Insert"];
type Vaccination = Database["public"]["Tables"]["vaccinations"]["Row"];

const MEMBER_BADGE_CLASSES: Record<MemberType, string> = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  silver: "bg-blue-50 text-blue-700 border-blue-200",
  gold: "bg-amber-50 text-amber-700 border-amber-200",
  platinum: "bg-violet-50 text-violet-700 border-violet-200",
};

const STATUS_DOT: Record<string, string> = {
  valid: "bg-green-500",
  expiring_soon: "bg-amber-500",
  expired: "bg-red-500",
  none: "bg-gray-300",
};

const STATUS_LABEL: Record<string, string> = {
  valid: "Vaccines up to date",
  expiring_soon: "Vaccine expiring soon",
  expired: "Vaccine expired",
  none: "No vaccinations",
};

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  checked_in: "bg-emerald-100 text-emerald-800 border-emerald-200",
  checked_out: "bg-slate-100 text-slate-600 border-slate-200",
  enquiry: "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  no_show: "bg-rose-100 text-rose-700 border-rose-200",
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

function bookingPetNames(b: BookingWithDetails): string {
  const names = b.booking_pets
    .map((bp) => bp.pets?.name)
    .filter(Boolean) as string[];
  return names.length ? names.join(", ") : "—";
}

function formatBookingStatus(status: BookingStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TIME_ANCHOR = new Date(2000, 0, 1);

function formatGroomSlotTime(t: string | null): string {
  if (!t) return "—";
  try {
    const base = parse(t.slice(0, 8), "HH:mm:ss", TIME_ANCHOR);
    return format(base, "h:mm a");
  } catch {
    return t;
  }
}

function parkLaneLabel(lane: ParkSize): string {
  return lane === "small" ? "Small dog" : "Big dog";
}

function groomerLine(g: GroomingAppointmentWithJoins): string {
  if (g.grooming_notes?.trim()) return g.grooming_notes.trim();
  return "—";
}

function groomingStatusLabel(status: string, noShow: boolean): string {
  if (noShow) return "No show";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type HistoryServiceFilter = "all" | "boarding" | "grooming" | "park";

function historyFilterEmptyMessage(filter: HistoryServiceFilter): string {
  switch (filter) {
    case "boarding":
      return "No boarding stays in this history.";
    case "grooming":
      return "No grooming appointments in this history.";
    case "park":
      return "No park visits in this history.";
    default:
      return "No bookings yet.";
  }
}

type BookingDetailSelection =
  | { kind: "stay"; stay: BookingWithDetails }
  | { kind: "grooming"; groom: GroomingAppointmentWithJoins }
  | { kind: "park"; park: ParkBookingWithJoins };

function overallVaccinationStatus(
  vaccinations: Vaccination[]
): "valid" | "expiring_soon" | "expired" | "none" {
  if (!vaccinations || vaccinations.length === 0) return "none";
  const statuses = vaccinations.map((v) => getVaccinationStatus(v.expiry_date));
  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("expiring_soon")) return "expiring_soon";
  return "valid";
}

function makePetForm(ownerId: string): PetInsert {
  return {
    name: "",
    owner_id: ownerId,
    species: "dog",
    breed: "",
    colour: "",
    date_of_birth: "",
    weight_kg: undefined,
    gender: undefined,
    spayed_neutered: false,
    feeding_instructions: "",
    medical_conditions: "",
    medications: "",
    behavioural_notes: "",
    assessment_status: "not_assessed",
    microchip_number: "",
    grooming_notes: "",
    other_notes: "",
    vet_name: "",
    vet_phone: "",
    photo_url: "",
  };
}

// ── Owner Billing Section ────────────────────────────────────────────────────

function OwnerBillingSection({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const statement = useOwnerStatement(ownerId);
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoicesForOwner(ownerId);
  const { adjustments, isLoading: adjLoading } = useBillingAdjustments(ownerId);
  const finalise = useFinaliseInvoice();
  const processPayment = useProcessPayment();
  const voidInvoice = useVoidInvoice();

  const [payDialogInvoice, setPayDialogInvoice] = useState<InvoiceWithItems | null>(null);
  const [payMethod, setPayMethod] = useState<"wallet" | "card" | "cash">("wallet");
  const [payStaff, setPayStaff] = useState("");
  const [viewInvoice, setViewInvoice] = useState<InvoiceWithItems | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const topUp = useTopUpWallet();
  const overdueCount = invoices.filter((inv) => inv.status === "overdue").length;

  const payDialogTotals = useMemo(
    () =>
      payDialogInvoice
        ? invoiceDisplayTotals({
            total: payDialogInvoice.total,
            total_aed: payDialogInvoice.total_aed,
            vat_aed: payDialogInvoice.vat_aed,
          })
        : null,
    [payDialogInvoice],
  );

  const viewInvoiceTotals = useMemo(
    () =>
      viewInvoice
        ? invoiceDisplayTotals({
            total: viewInvoice.total,
            total_aed: viewInvoice.total_aed,
            vat_aed: viewInvoice.vat_aed,
          })
        : null,
    [viewInvoice],
  );

  const handleFinalise = (inv: InvoiceWithItems) => {
    finalise.mutate(inv.id, {
      onSuccess: () => toast.success(`Invoice ${inv.invoice_number ?? ""} finalised`),
      onError: (err) => toast.error(err.message),
    });
  };

  const handlePay = async () => {
    if (!payDialogInvoice || !payStaff.trim()) {
      toast.error("Enter staff name");
      return;
    }
    const result = await processPayment.mutateAsync({
      invoiceId: payDialogInvoice.id,
      method: payMethod,
      staffName: payStaff.trim(),
    });
    if (result.success) setPayDialogInvoice(null);
  };

  const handleVoid = (inv: InvoiceWithItems) => {
    voidInvoice.mutate(
      { invoiceId: inv.id, reason: "Voided from owner profile", refundAmount: 0, staffName: "admin" },
      {
        onSuccess: () => toast.success("Invoice voided"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Billing & Invoices
          {overdueCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {overdueCount} overdue
            </Badge>
          )}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTopUpOpen(true)}>
            <Wallet className="mr-1.5 h-4 w-4" />
            Top up
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/billing/statements/${ownerId}`)}>
            <FileText className="mr-1.5 h-4 w-4" />
            Statement
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/billing")}>
            <FileText className="mr-1.5 h-4 w-4" />
            Full Billing
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {!statement.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Wallet</p>
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

      {/* Recent invoices */}
      <Card>
        <CardContent className="p-0">
          {invoicesLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-7 w-7 mb-2 opacity-40" />
              <p className="text-sm">No invoices yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.slice(0, 10).map((inv) => {
                  const sb = INVOICE_STATUS_BADGE[inv.status] ?? INVOICE_STATUS_BADGE.draft;
                  const canFinalise = inv.status === "draft";
                  const canPay = ["finalised", "issued", "outstanding", "overdue"].includes(inv.status);
                  const canVoid = !["voided", "cancelled", "paid"].includes(inv.status);
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
                      <TableCell className="text-sm font-semibold tabular-nums text-right">
                        {formatAed(
                          invoiceDisplayTotals({
                            total: inv.total,
                            total_aed: inv.total_aed,
                            vat_aed: inv.vat_aed,
                          }).grandTotal,
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewInvoice(inv)} title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canFinalise && (
                            <Button size="sm" variant="ghost" disabled={finalise.isPending} onClick={() => handleFinalise(inv)} title="Finalise">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canPay && (
                            <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => { setPayDialogInvoice(inv); setPayStaff(""); setPayMethod("wallet"); }} title="Pay">
                              <CreditCard className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canVoid && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleVoid(inv)} title="Void">
                              <Ban className="h-3.5 w-3.5" />
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

      {/* Recent adjustments */}
      {!adjLoading && adjustments.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Recent Adjustments</p>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Approved By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.slice(0, 5).map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(parseISO(adj.created_at), "d MMM yyyy")}</TableCell>
                      <TableCell className="text-sm capitalize">{adj.adjustment_type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={adj.reason}>{adj.reason}</TableCell>
                      <TableCell className="text-sm tabular-nums text-right">{adj.adjusted_amount != null ? formatAed(adj.adjusted_amount) : "—"}</TableCell>
                      <TableCell className="text-sm">{adj.approved_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pay dialog */}
      {payDialogInvoice && (
        <Dialog open={!!payDialogInvoice} onOpenChange={(o) => { if (!o) setPayDialogInvoice(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Process Payment
              </DialogTitle>
              <DialogDescription>
                Invoice {payDialogInvoice.invoice_number ?? payDialogInvoice.id.slice(0, 8)} —{" "}
                {payDialogTotals ? formatAed(payDialogTotals.grandTotal) : "—"} incl. VAT
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {payDialogTotals ? (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (before VAT)</span><span>{formatAed(payDialogTotals.netExVat)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{formatAed(payDialogTotals.vat)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Grand total</span><span>{formatAed(payDialogTotals.grandTotal)}</span></div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as "wallet" | "card" | "cash")}>
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
                <Input placeholder="Who is processing?" value={payStaff} onChange={(e) => setPayStaff(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-4">
              <Button variant="outline" onClick={() => setPayDialogInvoice(null)} disabled={processPayment.isPending}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={processPayment.isPending} onClick={handlePay}>
                {processPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Pay {payDialogTotals ? formatAed(payDialogTotals.grandTotal) : "—"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Invoice detail dialog */}
      {viewInvoice && (
        <Dialog open={!!viewInvoice} onOpenChange={(o) => { if (!o) setViewInvoice(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice {viewInvoice.invoice_number ?? viewInvoice.id.slice(0, 8)}
              </DialogTitle>
              <DialogDescription>
                Created {format(parseISO(viewInvoice.created_at), "d MMM yyyy")}
              </DialogDescription>
            </DialogHeader>

            <div id="invoice-print-area">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>INVOICE</div>
                  <p style={{ color: "#666", marginTop: 4 }}>{viewInvoice.invoice_number ?? viewInvoice.id.slice(0, 8)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: "#666", fontSize: 13 }}>{format(parseISO(viewInvoice.created_at), "d MMMM yyyy")}</p>
                  {viewInvoice.due_date && <p style={{ color: "#666", fontSize: 13 }}>Due: {viewInvoice.due_date}</p>}
                  <Badge variant="outline" className={(INVOICE_STATUS_BADGE[viewInvoice.status] ?? INVOICE_STATUS_BADGE.draft).className}>
                    {(INVOICE_STATUS_BADGE[viewInvoice.status] ?? INVOICE_STATUS_BADGE.draft).label}
                  </Badge>
                </div>
              </div>

              {viewInvoice.service_type && (
                <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                  Service: <span style={{ textTransform: "capitalize" }}>{viewInvoice.service_type.replace(/_/g, " ")}</span>
                </p>
              )}
              {viewInvoice.booking_ref && (
                <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                  Booking: <span style={{ fontWeight: 500 }}>{viewInvoice.booking_ref}</span>
                </p>
              )}
              {viewInvoice.booking_check_in && viewInvoice.booking_check_out && (
                <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                  Stay: {format(parseISO(viewInvoice.booking_check_in), "d MMM yyyy")} → {format(parseISO(viewInvoice.booking_check_out), "d MMM yyyy")}
                </p>
              )}

              <Separator className="my-3" />

              {(viewInvoice.line_items ?? []).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewInvoice.line_items ?? []).map((li) => (
                      <TableRow key={li.id}>
                        <TableCell className="text-sm">{li.description ?? li.pricing_key ?? "—"}</TableCell>
                        <TableCell className="text-sm text-right">{li.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatAed(li.unit_price)}</TableCell>
                        <TableCell className="text-sm text-right font-semibold">{formatAed(li.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No line items</p>
              )}

              <Separator className="my-3" />

              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex justify-between w-60">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatAed(viewInvoice.subtotal_aed)}</span>
                </div>
                {viewInvoice.discount_aed > 0 && (
                  <div className="flex justify-between w-60">
                    <span className="text-muted-foreground">Discount ({viewInvoice.discount_pct}%)</span>
                    <span className="text-emerald-600">-{formatAed(viewInvoice.discount_aed)}</span>
                  </div>
                )}
                {viewInvoiceTotals ? (
                  <>
                    <div className="flex justify-between w-60">
                      <span className="text-muted-foreground">Subtotal (ex VAT)</span>
                      <span>{formatAed(viewInvoiceTotals.netExVat)}</span>
                    </div>
                    <div className="flex justify-between w-60">
                      <span className="text-muted-foreground">{vatLineLabel()}</span>
                      <span>{formatAed(viewInvoiceTotals.vat)}</span>
                    </div>
                    <div className="flex justify-between w-60 font-bold text-lg border-t-2 border-foreground pt-2 mt-1">
                      <span>Grand total (incl. VAT)</span>
                      <span>{formatAed(viewInvoiceTotals.grandTotal)}</span>
                    </div>
                  </>
                ) : null}
              </div>

              {viewInvoice.payment_method && (
                <div className="flex justify-between w-60 ml-auto text-sm mt-1">
                  <span className="text-muted-foreground">Payment method</span>
                  <span className="capitalize">{viewInvoice.payment_method}</span>
                </div>
              )}

              {viewInvoice.paid_at && (
                <p className="mt-4 text-sm text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Paid on {format(parseISO(viewInvoice.paid_at), "d MMM yyyy")} via {viewInvoice.payment_method ?? "—"}
                </p>
              )}
              {viewInvoice.voided_at && (
                <p className="mt-4 text-sm text-destructive flex items-center gap-1.5">
                  <Ban className="h-4 w-4" />
                  Voided on {format(parseISO(viewInvoice.voided_at), "d MMM yyyy")}
                  {viewInvoice.voided_reason ? ` — ${viewInvoice.voided_reason}` : ""}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button variant="outline" onClick={() => setViewInvoice(null)}>Close</Button>
              <Button onClick={() => {
                const el = document.getElementById("invoice-print-area");
                if (!el) return;
                const w = window.open("", "_blank");
                if (!w) return;
                w.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>
                  * { margin:0; padding:0; box-sizing:border-box; }
                  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding:40px; color:#111; font-size:14px; }
                  table { width:100%; border-collapse:collapse; } th,td { padding:8px 12px; text-align:left; border-bottom:1px solid #eee; }
                  th { background:#f5f5f5; font-size:12px; text-transform:uppercase; color:#666; }
                  .footer { margin-top:40px; color:#999; font-size:12px; text-align:center; }
                  @media print { body { padding:20px; } }
                </style></head><body>${el.innerHTML}<div class="footer">Generated ${format(new Date(), "d MMM yyyy, HH:mm")}</div></body></html>`);
                w.document.close(); w.focus(); w.print();
              }}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Top up wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Amount (AED)</Label>
            <Input type="number" min="0.01" step="0.01" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)} disabled={topUp.isPending}>Cancel</Button>
            <Button
              onClick={() => {
                const amount = parseFloat(topUpAmount);
                if (!amount || amount <= 0) return toast.error("Enter a valid amount.");
                topUp.mutate(
                  { owner_id: ownerId, amount, payment_method: "cash", notes: "Top-up from owner profile" },
                  {
                    onSuccess: () => {
                      toast.success("Wallet topped up.");
                      setTopUpAmount("");
                      setTopUpOpen(false);
                    },
                    onError: (err) => toast.error(err.message || "Top up failed."),
                  },
                );
              }}
              disabled={topUp.isPending}
            >
              {topUp.isPending ? "Processing..." : "Confirm top up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const OwnerProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: owner, isLoading: ownerLoading } = useOwner(id!);
  const { data: pets, isLoading: petsLoading } = usePets(id!);
  const { data: daycarePackages, isLoading: packagesLoading } = useDaycarePackages(id!);
  const { data: ownerBookings = [], isLoading: bookingsLoading } = useOwnerBookings(id!);
  const { data: ownerGrooming = [], isLoading: groomingHistoryLoading } =
    useOwnerGroomingAppointments(id!);
  const { data: ownerParkBookings = [], isLoading: parkHistoryLoading } =
    useOwnerParkBookings(id!);
  const ownerStatement = useOwnerStatement(id!);
  const updateOwner = useUpdateOwner();
  const deleteOwner = useDeleteOwner();
  const createPet = useCreatePet();

  const [editOwnerOpen, setEditOwnerOpen] = useState(false);
  const [addPetOpen, setAddPetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bookingDetail, setBookingDetail] = useState<BookingDetailSelection | null>(null);
  const [historyServiceFilter, setHistoryServiceFilter] =
    useState<HistoryServiceFilter>("all");

  const [ownerForm, setOwnerForm] = useState<OwnerUpdate & { id: string }>({
    id: id!,
  });
  const [petForm, setPetForm] = useState<PetInsert>(makePetForm(id!));
  const [vaccinationRows, setVaccinationRows] = useState<VaccinationRow[]>([]);

  // photo upload
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return petForm.photo_url ?? null;
    setPhotoUploading(true);
    const ext = photoFile.name.split(".").pop();
    const path = `${id!}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("pet-photos")
      .upload(path, photoFile, { upsert: true });
    setPhotoUploading(false);
    if (error) {
      toast.error("Photo upload failed: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("pet-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const openEditDrawer = () => {
    if (owner) {
      setOwnerForm({
        id: owner.id,
        first_name: owner.first_name,
        last_name: owner.last_name,
        phone: owner.phone,
        email: owner.email,
        member_type: owner.member_type,
        notes: owner.notes,
        address: owner.address,
        emergency_contact_name: owner.emergency_contact_name,
        emergency_contact_phone: owner.emergency_contact_phone,
        vet_name: owner.vet_name,
        vet_phone: owner.vet_phone,
        preferred_groomer: owner.preferred_groomer,
        how_heard: owner.how_heard,
        emirates_id: owner.emirates_id,
        is_vip: owner.is_vip,
        always_same_room: owner.always_same_room,
        camera_required: owner.camera_required,
      });
    }
    setEditOwnerOpen(true);
  };

  const handleOwnerField = (field: keyof OwnerUpdate, value: string) => {
    setOwnerForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOwnerToggle = (field: keyof OwnerUpdate, value: boolean) => {
    setOwnerForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateOwner.mutate(ownerForm as OwnerUpdate & { id: string }, {
      onSuccess: () => {
        toast.success("Owner updated");
        setEditOwnerOpen(false);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to update owner");
      },
    });
  };

  const handlePetField = (field: keyof PetInsert, value: unknown) => {
    setPetForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const photoUrl = await uploadPhoto();
    createPet.mutate({ ...petForm, photo_url: photoUrl }, {
      onSuccess: async (newPet) => {
        // Insert vaccination rows sequentially
        for (const row of vaccinationRows) {
          if (!row.vaccine_name.trim() || !row.expiry_date) continue;

          const displayName = row.brand.trim()
            ? `${row.vaccine_name.trim()} (${row.brand.trim()})`
            : row.vaccine_name.trim();

          await supabase.from("vaccinations").insert({
            pet_id: newPet.id,
            vaccine_name: displayName,
            administered_date: row.administered_date || null,
            expiry_date: row.expiry_date,
            document_url: null,
          });
        }

        toast.success("Pet added");
        setAddPetOpen(false);
        setPetForm(makePetForm(id!));
        setVaccinationRows([]);
        setPhotoFile(null);
        setPhotoPreview(null);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to add pet");
      },
    });
  };

  const bookingTimeline = useMemo(() => {
    type Row =
      | { kind: "stay"; sortKey: string; id: string; stay: BookingWithDetails }
      | { kind: "grooming"; sortKey: string; id: string; groom: GroomingAppointmentWithJoins }
      | { kind: "park"; sortKey: string; id: string; park: ParkBookingWithJoins };

    const rows: Row[] = [];

    ownerBookings.forEach((b) => {
      rows.push({
        kind: "stay",
        sortKey: `${b.check_in_date}T12:00:00`,
        id: b.id,
        stay: b,
      });
    });

    ownerGrooming.forEach((g) => {
      const tt = (g.appointment_time || "00:00:00").slice(0, 8);
      rows.push({
        kind: "grooming",
        sortKey: `${g.appointment_date}T${tt}`,
        id: g.id,
        groom: g,
      });
    });

    ownerParkBookings.forEach((p) => {
      const tt = (p.slot_start || "00:00:00").slice(0, 8);
      rows.push({
        kind: "park",
        sortKey: `${p.visit_date}T${tt}`,
        id: p.id,
        park: p,
      });
    });

    rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
    return rows;
  }, [ownerBookings, ownerGrooming, ownerParkBookings]);

  const filteredBookingTimeline = useMemo(() => {
    if (historyServiceFilter === "all") return bookingTimeline;
    return bookingTimeline.filter((row) => {
      switch (historyServiceFilter) {
        case "grooming":
          return row.kind === "grooming";
        case "park":
          return row.kind === "park";
        case "boarding":
          return row.kind === "stay";
        default:
          return true;
      }
    });
  }, [bookingTimeline, historyServiceFilter]);

  const historyLoading = bookingsLoading || groomingHistoryLoading || parkHistoryLoading;

  if (ownerLoading) {
    return (
      <>
        <TopBar title="Customer Profile" />
        <main className="flex-1 overflow-auto p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </main>
      </>
    );
  }

  if (!owner) {
    return (
      <>
        <TopBar title="Customer Profile" />
        <main className="flex-1 overflow-auto p-8">
          <p className="text-muted-foreground">Owner not found.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Customer Profile" />
      <main className="flex-1 overflow-auto p-8 space-y-8">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Customers
        </Button>

        {/* ─── Owner Summary Card ─── */}
        <Card>
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold">
                {ownerDisplayName(owner.first_name, owner.last_name)}
              </h2>
              <p className="text-sm text-muted-foreground">{owner.phone}</p>
              {owner.email && (
                <p className="text-sm text-muted-foreground">{owner.email}</p>
              )}
              <Badge
                variant="outline"
                className={MEMBER_BADGE_CLASSES[owner.member_type]}
              >
                {owner.member_type.charAt(0).toUpperCase() +
                  owner.member_type.slice(1)}
              </Badge>
              {owner.pets && owner.pets.length > 0 && (
                <p className="text-sm text-muted-foreground pt-1 max-w-xl">
                  <span className="font-medium text-foreground">Pets: </span>
                  {owner.pets
                    .map((p) =>
                      p.breed ? `${p.name} (${p.breed})` : p.name
                    )
                    .join(", ")}
                </p>
              )}
              {owner.preferred_groomer?.trim() ? (
                <p className="text-sm text-muted-foreground pt-1">
                  <span className="font-medium text-foreground">Preferred groomer: </span>
                  {owner.preferred_groomer.trim()}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-6">
              {!ownerStatement.isLoading && ownerStatement.totalOutstanding > 0 && (
                <div className="text-right">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Outstanding
                  </div>
                  <p className={`mt-1 text-3xl font-bold tabular-nums ${ownerStatement.totalOutstanding > 500 ? "text-red-600" : "text-amber-600"}`}>
                    AED {ownerStatement.totalOutstanding.toFixed(2)}
                  </p>
                </div>
              )}
              <div className="text-right">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <Wallet className="h-3.5 w-3.5" />
                  Wallet Balance
                </div>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  AED {owner.wallet_balance.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openEditDrawer}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/40"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>

          {/* Flags strip — only rendered when at least one flag is set */}
          {(owner.is_vip || owner.always_same_room || owner.camera_required) && (
            <>
              <Separator />
              <div className="flex items-center gap-2 px-6 py-3 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">
                  Flags
                </span>
                {owner.is_vip && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    VIP
                  </Badge>
                )}
                {owner.always_same_room && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                    Always Same Room
                  </Badge>
                )}
                {owner.camera_required && (
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                    Camera Required
                  </Badge>
                )}
              </div>
            </>
          )}
        </Card>

        {/* ─── Pets Section ─── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <PawPrint className="h-5 w-5" />
              Pets
            </h3>
            <Button
              size="sm"
              onClick={() => {
                setPetForm(makePetForm(id!));
                setAddPetOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Pet
            </Button>
          </div>

          {petsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
              ))}
            </div>
          ) : !pets || pets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PawPrint className="h-8 w-8 mb-2" />
                <p>No pets registered yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet: PetWithVaccinations) => {
                const vacStatus = overallVaccinationStatus(pet.vaccinations);
                const vacSummary = petVaccinationSummaryLine(pet.vaccinations);
                return (
                  <Card
                    key={pet.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() =>
                      navigate(`/customers/${id}/pets/${pet.id}`)
                    }
                  >
                    <CardContent className="flex gap-4 p-4">
                      {pet.photo_url ? (
                        <img
                          src={pet.photo_url}
                          alt={pet.name}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {pet.species === "cat" ? (
                            <Cat className="h-6 w-6 text-muted-foreground" />
                          ) : (
                            <Dog className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{pet.name}</p>
                          <span
                            title={STATUS_LABEL[vacStatus]}
                            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[vacStatus]}`}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground capitalize">
                          {pet.species}
                          {pet.breed ? ` · ${pet.breed}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {STATUS_LABEL[vacStatus]}
                        </p>
                        <p
                          className="mt-1 text-xs text-muted-foreground line-clamp-2"
                          title={vacSummary}
                        >
                          {vacSummary}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Booking history (stays, grooming, park) ─── */}
        <section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BedDouble className="h-5 w-5" />
              Booking History
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={historyServiceFilter === "all" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "all"}
                onClick={() => setHistoryServiceFilter("all")}
              >
                All
              </Button>
              <Button
                variant={historyServiceFilter === "boarding" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "boarding"}
                onClick={() => setHistoryServiceFilter("boarding")}
              >
                Boarding
              </Button>
              <Button
                variant={historyServiceFilter === "grooming" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "grooming"}
                onClick={() => setHistoryServiceFilter("grooming")}
              >
                Grooming
              </Button>
              <Button
                variant={historyServiceFilter === "park" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "park"}
                onClick={() => setHistoryServiceFilter("park")}
              >
                Park
              </Button>
            </div>
          </div>

          {historyLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : bookingTimeline.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BedDouble className="h-7 w-7 mb-2 opacity-60" />
                <p className="text-sm">No bookings yet.</p>
              </CardContent>
            </Card>
          ) : filteredBookingTimeline.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BedDouble className="h-7 w-7 mb-2 opacity-60" />
                <p className="text-sm">{historyFilterEmptyMessage(historyServiceFilter)}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="whitespace-nowrap">Ref</TableHead>
                    <TableHead className="whitespace-nowrap">Service</TableHead>
                    <TableHead className="min-w-[140px]">Dates</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="min-w-[160px]">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookingTimeline.map((row) => {
                    if (row.kind === "stay") {
                      const b = row.stay;
                      const nights = calculateNights(b.check_in_date, b.check_out_date);
                      const room = b.rooms;
                      const service = boardingServiceLabel(room?.wing);
                      const roomLine = room?.display_name ?? "—";
                      return (
                        <TableRow
                          key={`stay-${b.id}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setBookingDetail({ kind: "stay", stay: b })}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {b.booking_ref ?? b.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{service}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(parseISO(b.check_in_date), "d MMM yyyy")}
                            {" → "}
                            {format(parseISO(b.check_out_date), "d MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={BOOKING_STATUS_BADGE[b.status]}
                            >
                              {formatBookingStatus(b.status)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-sm max-w-[220px] truncate"
                            title={`${bookingPetNames(b)} · ${roomLine} · ${nights}n`}
                          >
                            {bookingPetNames(b)} · {roomLine} · {nights}n
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (row.kind === "grooming") {
                      const g = row.groom;
                      const dateLine = `${format(parseISO(g.appointment_date), "d MMM yyyy")}${
                        g.appointment_time
                          ? ` · ${formatGroomSlotTime(g.appointment_time)}`
                          : ""
                      }`;
                      return (
                        <TableRow
                          key={`groom-${g.id}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setBookingDetail({ kind: "grooming", groom: g })}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {g.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">Grooming</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{dateLine}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {groomingStatusLabel(g.status, g.no_show)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-sm max-w-[220px] truncate"
                            title={`${g.pets?.name ?? "—"} · ${labelForGroomingService(g.service)}`}
                          >
                            {g.pets?.name ?? "—"} · {labelForGroomingService(g.service)}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const p = row.park;
                    const dateLine = `${format(parseISO(p.visit_date), "d MMM yyyy")} · ${formatGroomSlotTime(p.slot_start)}`;
                    return (
                      <TableRow
                        key={`park-${p.id}`}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setBookingDetail({ kind: "park", park: p })}
                      >
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {p.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">Park</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{dateLine}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {p.is_assessment ? "Assessment" : "Booked"}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-sm max-w-[220px] truncate"
                          title={`${p.pets?.name ?? "—"} · ${parkLaneLabel(p.size_lane)}`}
                        >
                          {p.pets?.name ?? "—"} · {parkLaneLabel(p.size_lane)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Daycare Packages ─── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Daycare Packages
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate(`/daycare?tab=packages`)
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Package
            </Button>
          </div>

          {packagesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : !daycarePackages || daycarePackages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <CalendarDays className="h-7 w-7 mb-2" />
                <p className="text-sm">No daycare packages yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {daycarePackages.map((pkg) => {
                const petName   = pets?.find((p) => p.id === pkg.pet_id)?.name ?? "Unknown Pet";
                const remaining = pkg.total_days - pkg.days_used;
                const pct       = Math.min(100, (pkg.days_used / Math.max(1, pkg.total_days)) * 100);
                const isExhausted = remaining <= 0;
                const creditColour = remaining <= 1
                  ? "text-red-600"
                  : remaining <= 3
                  ? "text-amber-600"
                  : "text-emerald-600";
                const barColour = remaining <= 1
                  ? "bg-red-500"
                  : remaining <= 3
                  ? "bg-amber-500"
                  : "bg-emerald-500";

                return (
                  <Card
                    key={pkg.id}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isExhausted ? "opacity-60" : ""}`}
                    onClick={() =>
                      navigate(
                        `/daycare?tab=planner&ownerId=${id}&packageId=${pkg.id}`
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(
                          `/daycare?tab=planner&ownerId=${id}&packageId=${pkg.id}`
                        );
                      }
                    }}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-semibold text-sm truncate">{petName}</p>
                          <div className="flex items-center gap-1.5">
                            {isExhausted ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Exhausted</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Active</Badge>
                            )}
                            {pkg.expiry_date && (
                              <span className="text-[10px] text-muted-foreground">
                                Exp {pkg.expiry_date}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={`text-right shrink-0 ${creditColour}`}>
                          {remaining <= 3 && !isExhausted && (
                            <AlertTriangle className="h-3.5 w-3.5 ml-auto mb-0.5" />
                          )}
                          <p className="text-xl font-bold tabular-nums leading-none">
                            {pkg.days_used}
                            <span className="text-sm font-normal text-muted-foreground">/{pkg.total_days}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{remaining} left</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColour}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Billing & Invoices Section ─── */}
        <OwnerBillingSection ownerId={id!} />

        <Separator />

        {/* ─── Booking detail (from history row) ─── */}
        <Sheet
          open={bookingDetail !== null}
          onOpenChange={(open) => {
            if (!open) setBookingDetail(null);
          }}
        >
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            {bookingDetail?.kind === "stay" && (
              <>
                <SheetHeader>
                  <SheetTitle>
                    {bookingDetail.stay.booking_ref ?? "Stay details"}
                  </SheetTitle>
                  <SheetDescription>
                    {boardingServiceLabel(bookingDetail.stay.rooms?.wing)} stay.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Badge
                    variant="outline"
                    className={BOOKING_STATUS_BADGE[bookingDetail.stay.status]}
                  >
                    {formatBookingStatus(bookingDetail.stay.status)}
                  </Badge>
                  {bookingDetail.stay.do_not_move && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200">
                      DO NOT MOVE
                    </Badge>
                  )}
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Customer</p>
                    {bookingDetail.stay.owners ? (
                      <Link
                        to={`/customers/${bookingDetail.stay.owner_id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {ownerDisplayName(bookingDetail.stay.owners.first_name, bookingDetail.stay.owners.last_name)}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <p className="text-sm">—</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Pets</p>
                    <div className="text-sm space-y-1">
                      {bookingDetail.stay.booking_pets.length === 0 ? (
                        <p>—</p>
                      ) : (
                        bookingDetail.stay.booking_pets.map((bp) => (
                          <button
                            key={bp.pet_id}
                            type="button"
                            className="flex items-center gap-1 font-medium text-primary hover:underline"
                            onClick={() =>
                              navigate(`/customers/${id}/pets/${bp.pet_id}`)
                            }
                          >
                            {bp.pets?.name ?? "Pet"}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Room</p>
                    <p className="text-sm">
                      {bookingDetail.stay.rooms?.display_name ?? "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
                      <p className="text-sm">
                        {format(parseISO(bookingDetail.stay.check_in_date), "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
                      <p className="text-sm">
                        {format(parseISO(bookingDetail.stay.check_out_date), "d MMM yyyy")}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {calculateNights(
                      bookingDetail.stay.check_in_date,
                      bookingDetail.stay.check_out_date,
                    )}{" "}
                    night
                    {calculateNights(
                      bookingDetail.stay.check_in_date,
                      bookingDetail.stay.check_out_date,
                    ) !== 1
                      ? "s"
                      : ""}
                  </p>
                  {(bookingDetail.stay.pickup_required ||
                    bookingDetail.stay.dropoff_required) && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">
                        Transport
                      </p>
                      <p className="text-sm">
                        {[
                          bookingDetail.stay.pickup_required && "Pickup (check-in)",
                          bookingDetail.stay.dropoff_required && "Drop-off (check-out)",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                  {bookingDetail.stay.notes && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                      <p className="text-sm whitespace-pre-line">{bookingDetail.stay.notes}</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <Link to={boardingCalendarTo(bookingDetail.stay.rooms?.wing)}>
                      Open calendar
                    </Link>
                  </Button>
                </div>
              </>
            )}

            {bookingDetail?.kind === "grooming" && (
              <>
                <SheetHeader>
                  <SheetTitle>Grooming appointment</SheetTitle>
                  <SheetDescription>
                    {format(parseISO(bookingDetail.groom.appointment_date), "EEEE, d MMMM yyyy")}
                    {bookingDetail.groom.appointment_time
                      ? ` · ${formatGroomSlotTime(bookingDetail.groom.appointment_time)}`
                      : ""}
                  </SheetDescription>
                  <p className="text-xs text-muted-foreground font-mono pt-1">
                    {bookingDetail.groom.id}
                  </p>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Badge variant="outline" className="capitalize">
                    {groomingStatusLabel(bookingDetail.groom.status, bookingDetail.groom.no_show)}
                  </Badge>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Service</p>
                    <p className="text-sm font-medium">
                      {labelForGroomingService(bookingDetail.groom.service)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Pet</p>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      onClick={() =>
                        navigate(`/customers/${id}/pets/${bookingDetail.groom.pet_id}`)
                      }
                    >
                      {bookingDetail.groom.pets?.name ?? "—"}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Groomer</p>
                    <p className="text-sm">{groomerLine(bookingDetail.groom)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Price</p>
                    <p className="text-sm tabular-nums">
                      {bookingDetail.groom.price != null
                        ? `AED ${bookingDetail.groom.price.toFixed(0)}`
                        : "—"}
                    </p>
                  </div>
                  {bookingDetail.groom.notes && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                      <p className="text-sm whitespace-pre-line">{bookingDetail.groom.notes}</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <Link to={`/grooming?date=${bookingDetail.groom.appointment_date}`}>
                      Open grooming schedule
                    </Link>
                  </Button>
                </div>
              </>
            )}

            {bookingDetail?.kind === "park" && (
              <>
                <SheetHeader>
                  <SheetTitle>Park visit</SheetTitle>
                  <SheetDescription>
                    {format(parseISO(bookingDetail.park.visit_date), "EEEE, d MMMM yyyy")}
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Time slot</p>
                    <p className="text-sm">{formatGroomSlotTime(bookingDetail.park.slot_start)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Lane</p>
                    <p className="text-sm">{parkLaneLabel(bookingDetail.park.size_lane)}</p>
                  </div>
                  <Badge variant="outline">
                    {bookingDetail.park.is_assessment ? "Assessment" : "Standard visit"}
                  </Badge>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Pet</p>
                    {bookingDetail.park.pet_id ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        onClick={() =>
                          navigate(`/customers/${id}/pets/${bookingDetail.park.pet_id}`)
                        }
                      >
                        {bookingDetail.park.pets?.name ?? "—"}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <p className="text-sm">—</p>
                    )}
                  </div>
                  {bookingDetail.park.notes && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                      <p className="text-sm whitespace-pre-line">{bookingDetail.park.notes}</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <Link to={`/park?date=${bookingDetail.park.visit_date}`}>
                      Open park schedule
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* ─── Edit Owner Drawer ─── */}
        <Sheet open={editOwnerOpen} onOpenChange={setEditOwnerOpen}>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit Owner</SheetTitle>
              <SheetDescription>
                Update customer details.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleOwnerSubmit} className="mt-6 space-y-4">
              {/* Core */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_first_name">First name <span className="text-destructive">*</span></Label>
                  <Input id="edit_first_name" required value={ownerForm.first_name ?? ""} onChange={(e) => handleOwnerField("first_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_last_name">Last name <span className="text-destructive">*</span></Label>
                  <Input id="edit_last_name" required value={ownerForm.last_name ?? ""} onChange={(e) => handleOwnerField("last_name", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Phone <span className="text-destructive">*</span></Label>
                  <Input id="edit_phone" type="tel" required value={ownerForm.phone ?? ""} onChange={(e) => handleOwnerField("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input id="edit_email" type="email" value={ownerForm.email ?? ""} onChange={(e) => handleOwnerField("email", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_member_type">Member type</Label>
                  <Select value={ownerForm.member_type ?? "standard"} onValueChange={(v) => handleOwnerField("member_type", v)}>
                    <SelectTrigger id="edit_member_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="platinum">Platinum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_emirates_id">Emirates ID</Label>
                  <Input id="edit_emirates_id" value={ownerForm.emirates_id ?? ""} onChange={(e) => handleOwnerField("emirates_id", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_address">Address</Label>
                <Textarea id="edit_address" rows={2} value={ownerForm.address ?? ""} onChange={(e) => handleOwnerField("address", e.target.value)} />
              </div>

              <Separator />

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emergency Contact</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_ec_name">Name</Label>
                  <Input id="edit_ec_name" value={ownerForm.emergency_contact_name ?? ""} onChange={(e) => handleOwnerField("emergency_contact_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_ec_phone">Phone</Label>
                  <Input id="edit_ec_phone" type="tel" value={ownerForm.emergency_contact_phone ?? ""} onChange={(e) => handleOwnerField("emergency_contact_phone", e.target.value)} />
                </div>
              </div>

              <Separator />

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vet Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_vet_name">Vet name</Label>
                  <Input id="edit_vet_name" value={ownerForm.vet_name ?? ""} onChange={(e) => handleOwnerField("vet_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_vet_phone">Vet phone</Label>
                  <Input id="edit_vet_phone" type="tel" value={ownerForm.vet_phone ?? ""} onChange={(e) => handleOwnerField("vet_phone", e.target.value)} />
                </div>
              </div>

              <Separator />

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preferences</p>

              <div className="space-y-2">
                <Label htmlFor="edit_preferred_groomer">Preferred groomer</Label>
                <Input
                  id="edit_preferred_groomer"
                  value={ownerForm.preferred_groomer ?? ""}
                  onChange={(e) => handleOwnerField("preferred_groomer", e.target.value)}
                  placeholder="Name of preferred groomer (optional)"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-fills the groomer field on new grooming appointments. Edits on a booking do not change this.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_how_heard">How did you hear about us?</Label>
                <Input id="edit_how_heard" value={ownerForm.how_heard ?? ""} onChange={(e) => handleOwnerField("how_heard", e.target.value)} />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="edit_is_vip" className="cursor-pointer">VIP</Label>
                <Switch id="edit_is_vip" checked={ownerForm.is_vip ?? false} onCheckedChange={(v) => handleOwnerToggle("is_vip", v)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="edit_always_same_room" className="cursor-pointer">Always same room</Label>
                <Switch id="edit_always_same_room" checked={ownerForm.always_same_room ?? false} onCheckedChange={(v) => handleOwnerToggle("always_same_room", v)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="edit_camera_required" className="cursor-pointer">Camera required</Label>
                <Switch id="edit_camera_required" checked={ownerForm.camera_required ?? false} onCheckedChange={(v) => handleOwnerToggle("camera_required", v)} />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea id="edit_notes" rows={3} value={ownerForm.notes ?? ""} onChange={(e) => handleOwnerField("notes", e.target.value)} />
              </div>

              <Button type="submit" className="w-full" disabled={updateOwner.isPending}>
                {updateOwner.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </SheetContent>
        </Sheet>

        {/* ─── Add Pet Drawer ─── */}
        <Sheet open={addPetOpen} onOpenChange={setAddPetOpen}>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Pet</SheetTitle>
              <SheetDescription>
                Register a new pet for {owner.first_name}.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handlePetSubmit} className="mt-6 space-y-4">
              {/* Photo upload */}
              <div className="space-y-2">
                <Label>Photo</Label>
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs">No photo</div>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]); }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                    {photoPreview ? "Change photo" : "Upload photo"}
                  </Button>
                  {photoPreview && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setPhotoFile(null); setPhotoPreview(null); handlePetField("photo_url", ""); }}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Basic info */}
              <div className="space-y-2">
                <Label htmlFor="pet_name">Name <span className="text-destructive">*</span></Label>
                <Input id="pet_name" required value={petForm.name} onChange={(e) => handlePetField("name", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pet_species">Species</Label>
                  <Select value={petForm.species ?? "dog"} onValueChange={(v) => handlePetField("species", v)}>
                    <SelectTrigger id="pet_species"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dog">Dog</SelectItem>
                      <SelectItem value="cat">Cat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pet_breed">Breed</Label>
                  <PetBreedCombobox
                    id="pet_breed"
                    value={(petForm.breed as string) ?? ""}
                    onChange={(v) => handlePetField("breed", v)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pet_colour">Colour</Label>
                  <Input id="pet_colour" value={(petForm.colour as string) ?? ""} onChange={(e) => handlePetField("colour", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pet_dob">Date of birth <span className="text-destructive">*</span></Label>
                  <Input id="pet_dob" type="date" required value={(petForm.date_of_birth as string) ?? ""} onChange={(e) => handlePetField("date_of_birth", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pet_weight">Weight (kg)</Label>
                  <Input id="pet_weight" type="number" step="0.1" min="0" value={petForm.weight_kg ?? ""} onChange={(e) => handlePetField("weight_kg", e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pet_gender">Gender</Label>
                  <Select value={petForm.gender ?? ""} onValueChange={(v) => handlePetField("gender", v || null)}>
                    <SelectTrigger id="pet_gender"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pet_microchip">Microchip number</Label>
                  <Input id="pet_microchip" value={(petForm.microchip_number as string) ?? ""} onChange={(e) => handlePetField("microchip_number", e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 col-span-1">
                  <Label htmlFor="pet_spayed" className="cursor-pointer">Spayed / Neutered</Label>
                  <Switch id="pet_spayed" checked={petForm.spayed_neutered ?? false} onCheckedChange={(v) => handlePetField("spayed_neutered", v)} />
                </div>
              </div>

              <Separator />

              {/* Vet */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vet Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pet_vet_name">Vet name</Label>
                  <VetClinicCombobox
                    id="pet_vet_name"
                    value={(petForm.vet_name as string) ?? ""}
                    onChange={(v) => handlePetField("vet_name", v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pet_vet_phone">Vet phone</Label>
                  <Input id="pet_vet_phone" type="tel" value={(petForm.vet_phone as string) ?? ""} onChange={(e) => handlePetField("vet_phone", e.target.value)} />
                </div>
              </div>

              <Separator />

              {/* Care notes */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Care Notes</p>

              <div className="space-y-2">
                <Label htmlFor="pet_feeding">Feeding instructions</Label>
                <Textarea id="pet_feeding" rows={2} value={(petForm.feeding_instructions as string) ?? ""} onChange={(e) => handlePetField("feeding_instructions", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_medical">Medical conditions</Label>
                <Textarea id="pet_medical" rows={2} value={(petForm.medical_conditions as string) ?? ""} onChange={(e) => handlePetField("medical_conditions", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_meds">Medications</Label>
                <Textarea id="pet_meds" rows={2} value={(petForm.medications as string) ?? ""} onChange={(e) => handlePetField("medications", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_behaviour">Behavioural notes</Label>
                <Textarea id="pet_behaviour" rows={2} value={(petForm.behavioural_notes as string) ?? ""} onChange={(e) => handlePetField("behavioural_notes", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_grooming">Grooming notes</Label>
                <Textarea id="pet_grooming" rows={2} value={(petForm.grooming_notes as string) ?? ""} onChange={(e) => handlePetField("grooming_notes", e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_other_notes">Other notes (bookings &amp; appointments)</Label>
                <Textarea id="pet_other_notes" rows={2} value={(petForm.other_notes as string) ?? ""} onChange={(e) => handlePetField("other_notes", e.target.value)} placeholder="Shown on boarding, grooming, park…" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pet_assessment">Assessment status</Label>
                <Select value={petForm.assessment_status ?? "not_assessed"} onValueChange={(v) => handlePetField("assessment_status", v)}>
                  <SelectTrigger id="pet_assessment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_assessed">Not Assessed</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Vaccinations */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vaccination History</p>
              <VaccinationEditor
                mode="local"
                rows={vaccinationRows}
                onChange={setVaccinationRows}
              />

              <Button type="submit" className="w-full" disabled={createPet.isPending || photoUploading}>
                {(createPet.isPending || photoUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {photoUploading ? "Uploading photo…" : "Add Pet"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </main>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {ownerDisplayName(owner?.first_name ?? null, owner?.last_name ?? null)}
              </span>{" "}
              and all their pet profiles from the database. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOwner.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteOwner.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteOwner.mutate(id!, {
                  onSuccess: () => {
                    toast.success("Customer deleted");
                    navigate("/customers");
                  },
                  onError: (err) => {
                    toast.error(err.message || "Failed to delete customer");
                  },
                });
              }}
            >
              {deleteOwner.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OwnerProfilePage;
