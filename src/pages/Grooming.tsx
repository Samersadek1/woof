import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDays,
  format,
  parse,
  parseISO,
  subDays,
} from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { ownerDisplayName } from "@/lib/bookingUtils";
import {
  useGroomingAppointments,
  useGroomingHistoryList,
  useGroomingGlobalSearch,
  useDeleteGroomingAppointment,
  useUpdateGroomingAppointment,
  useGroomingStatusTransition,
  useInvoiceForGroomingAppointment,
  useGroomingDayInvoices,
  sumGroomingInvoicePaidAed,
  sumGroomingInvoicePendingAed,
  type GroomingAppointmentWithJoins,
} from "@/hooks/useGrooming";
import { useProcessPayment, formatAed } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import { PaymentSplitDialog } from "@/components/billing/PaymentSplitDialog";
import {
  normalizeGroomingWorkflowStatus,
  previousWorkflowStatus,
  workflowStatusBadgeClass,
  workflowStatusLabel,
  type GroomingWorkflowStatus,
} from "@/lib/groomingWorkflow";
import {
  invoiceDisplayTotals,
  vatAmountFromGrossInclusive,
  vatLineLabel,
} from "@/lib/vatConfig";
import {
  groomingPaymentMethodLabel,
} from "@/lib/groomingPaymentMethod";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PetSpecialAlertsBanner } from "@/components/PetSpecialAlertsBanner";
import { DogSizeField } from "@/components/DogSizeField";
import { parsePetSpecialAlerts, petHasSpecialAlerts } from "@/lib/petAlerts";
import {
  groomingPricingCheckboxToDbService,
  isGroomingPricingCheckbox,
  resolvePrimaryGroomingCheckbox,
} from "@/lib/groomingNewAppointmentPricing";
import { VisitNotesField } from "@/components/grooming/VisitNotesField";
import { GroomingStationCalendar } from "@/components/grooming/GroomingStationCalendar";
import { GroomingDayBoard } from "@/components/grooming/GroomingDayBoard";
import { BlockStationDialog } from "@/components/grooming/BlockStationDialog";
import { GroomingConflictOverrideDialog } from "@/components/grooming/GroomingConflictOverrideDialog";
import {
  GroomingNewAppointmentSheet,
  type GroomingSlotPrefill,
} from "@/components/grooming/GroomingNewAppointmentSheet";
import {
  GROOMING_SERVICE_CHECKBOX_OPTIONS,
  estimatedPickupFromStartAndDuration,
  serviceTokenMatchesSavedOption,
  type GroomingServiceCheckbox,
} from "@/lib/groomingServiceForm";
import {
  useGroomingStations,
  useGroomingStationBlocks,
  useCreateGroomingStationBlock,
  useDeleteGroomingStationBlock,
  useLogGroomingScheduleOverrides,
  type GroomingStationBlockRow,
} from "@/hooks/useGroomingStations";
import {
  findGroomingScheduleConflicts,
  maxDurationMinutesForTimeInput,
  validateGroomingScheduleTime,
  type GroomingScheduleConflict,
} from "@/lib/groomingCalendarModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Undo2,
  X,
  CalendarIcon,
  ClipboardList,
  FileText,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import { cn } from "@/lib/utils";
import {
  labelForGroomingService,
  type GroomingService,
} from "@/lib/groomingCatalog";

const SERVICE_BADGE: Record<GroomingService, string> = {
  full_groom: "bg-purple-100 text-purple-800 border-purple-200",
  full_bath: "bg-blue-100 text-blue-800 border-blue-200",
  nail_clip: "bg-emerald-100 text-emerald-800 border-emerald-200",
  deshedding: "bg-orange-100 text-orange-800 border-orange-200",
  brushing: "bg-teal-100 text-teal-800 border-teal-200",
  pawdicure: "bg-pink-100 text-pink-800 border-pink-200",
};

function parseGroomingMeta(
  notes: string | null | undefined,
): { services: string[]; groomingDate: string | null; estimatedPickup: string | null } {
  if (!notes) return { services: [], groomingDate: null, estimatedPickup: null };
  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const servicesLine = lines.find((l) => l.toLowerCase().startsWith("services:"));
  const groomingDateLine = lines.find((l) =>
    l.toLowerCase().startsWith("grooming date:"),
  );
  const estimatedPickupLine = lines.find((l) =>
    l.toLowerCase().startsWith("estimated pickup:"),
  );
  const services = servicesLine
    ? servicesLine
        .slice("services:".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const groomingDate = groomingDateLine
    ? groomingDateLine.slice("grooming date:".length).trim() || null
    : null;
  const estimatedPickup = estimatedPickupLine
    ? estimatedPickupLine.slice("estimated pickup:".length).trim() || null
    : null;
  return { services, groomingDate, estimatedPickup };
}

function chipMatchesServiceFilter(label: string, filter: string): boolean {
  if (filter === "all") return true;
  const fl = filter.toLowerCase().trim();
  const ll = label.trim().toLowerCase();
  if (ll === fl) return true;
  if (ll.startsWith(`${fl} (`)) return true;
  if (ll.startsWith(`${fl} —`) || ll.startsWith(`${fl} -`)) return true;
  return false;
}

function eodAppointmentStatusBucket(status: string): "completed" | "pending" | "cancelled" {
  const n = normalizeGroomingWorkflowStatus(status);
  if (n === "cancelled") return "cancelled";
  if (n === "completed" || n === "paid") return "completed";
  return "pending";
}

function appointmentServiceLabels(a: GroomingAppointmentWithJoins): string[] {
  const primary = serviceLabel(a.service);
  const extra = parseGroomingMeta(a.notes).services;
  return Array.from(new Set([primary, ...extra]));
}

function appointmentTimeToInputValue(t: string | null): string {
  if (!t) return "10:00";
  const s = t.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : "10:00";
}

function userVisitNotesFromStored(notes: string | null): string {
  if (!notes) return "";
  const metaPrefixes = ["services:", "grooming date:", "discount:", "estimated pickup:"];
  return notes
    .split("\n")
    .filter((l) => !metaPrefixes.some((p) => l.toLowerCase().trimStart().startsWith(p)))
    .join("\n")
    .trim();
}

function workflowUndoTarget(raw: string): string | null {
  const wf = normalizeGroomingWorkflowStatus(raw);
  if (wf === "cancelled" || wf === "other") return null;
  return previousWorkflowStatus(wf as GroomingWorkflowStatus);
}

function serviceCheckboxValuesFromAppointment(
  a: GroomingAppointmentWithJoins,
): GroomingServiceCheckbox[] {
  const { services } = parseGroomingMeta(a.notes);

  /** Prefer first saved service label so distinct checkboxes that share one enum (e.g. Bath only vs Full bath) round-trip correctly. */
  let primary: GroomingServiceCheckbox | undefined;
  if (services.length > 0) {
    const first = services[0].trim();
    const byLabel = GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) =>
      serviceTokenMatchesSavedOption(first, o.label),
    );
    if (byLabel) primary = byLabel.value;
  }
  if (!primary) {
    const primaryOpt = GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.mapsTo === a.service);
    primary = primaryOpt?.value;
  }

  const extras = GROOMING_SERVICE_CHECKBOX_OPTIONS.filter((o) =>
    services.some((token) => serviceTokenMatchesSavedOption(token, o.label)),
  ).map((o) => o.value);
  const set = new Set<GroomingServiceCheckbox>();
  if (primary) set.add(primary);
  extras.forEach((e) => set.add(e));
  const arr = Array.from(set);
  return arr.length ? arr : ["full_groom"];
}

function serviceLabel(s: GroomingService): string {
  return labelForGroomingService(s);
}

function formatApptTime(t: string | null): string {
  if (!t) return "—";
  const slice = t.length >= 8 ? t.slice(0, 8) : `${t}:00`.slice(0, 8);
  try {
    const base = parse(slice, "HH:mm:ss", new Date(2000, 0, 1));
    return format(base, "h:mm a");
  } catch {
    return t;
  }
}

function groomerDisplay(a: GroomingAppointmentWithJoins): string {
  if (a.grooming_notes?.trim()) return a.grooming_notes.trim();
  return "—";
}

function AppointmentCard({
  a,
  onPrint,
  onOpenActions,
}: {
  a: GroomingAppointmentWithJoins;
  onPrint: (appointmentId: string) => void;
  onOpenActions: (row: GroomingAppointmentWithJoins) => void;
}) {
  const ownerName = a.owners
    ? ownerDisplayName(a.owners.first_name, a.owners.last_name)
    : "—";
  const phone = a.owners?.phone ?? "";
  const petName = a.pets?.name ?? "—";
  const breedWeight = [
    a.pets?.breed,
    a.pets?.weight_kg != null ? `${a.pets.weight_kg}kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const duration = a.duration_minutes ?? 60;
  const { services: selectedServiceLabels, groomingDate } = parseGroomingMeta(a.notes);
  const primaryLabel = serviceLabel(a.service);
  const extraServiceLabels = selectedServiceLabels.filter(
    (s) => s.toLowerCase() !== primaryLabel.toLowerCase(),
  );

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onOpenActions(a)}
    >
      <CardContent className="p-0">
        <div className="grid gap-4 p-4 lg:grid-cols-[10rem_1fr_14rem] lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("font-medium border", workflowStatusBadgeClass(a.status))}
              >
                {workflowStatusLabel(a.status)}
              </Badge>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatApptTime(a.appointment_time)}
            </p>
            <Badge variant="outline" className="font-normal">
              {duration} min
            </Badge>
          </div>

          <div className="space-y-2 min-w-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <p className="text-xl font-bold truncate">{petName}</p>
              {petHasSpecialAlerts(parsePetSpecialAlerts(a.pets?.special_alerts)) ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-orange-500 bg-orange-100 text-orange-950 text-[10px] font-semibold uppercase tracking-wide"
                >
                  ⚠ Alert
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {breedWeight || "—"}
            </p>
            <p className="text-sm">
              <span className="font-medium">{ownerName}</span>
              {phone ? (
                <>
                  {" · "}
                  <a
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="text-primary hover:underline"
                  >
                    {phone}
                  </a>
                </>
              ) : null}
            </p>
            {a.pets?.grooming_notes ? (
              <p className="text-sm italic text-muted-foreground whitespace-pre-line">
                {a.pets.grooming_notes}
              </p>
            ) : null}
            <BookingProfileNotes
              compact
              ownerOtherNotes={a.owners?.other_notes}
              pets={[
                {
                  name: petName,
                  otherNotes: a.pets?.other_notes,
                },
              ]}
            />
            <div className="pt-1">
              <Label className="text-xs text-muted-foreground">Visit notes</Label>
              <VisitNotesField a={a} />
            </div>
          </div>

          <div className="space-y-3 lg:text-right">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge
                variant="outline"
                className={cn("font-medium", SERVICE_BADGE[a.service])}
              >
                {primaryLabel}
              </Badge>
              {extraServiceLabels.map((label) => (
                <Badge
                  key={`${a.id}-${label}`}
                  variant="outline"
                  className="bg-muted/40 text-foreground border-border"
                >
                  {label}
                </Badge>
              ))}
              {a.booking_id ? (
                <Badge
                  variant="outline"
                  className="gap-1 bg-slate-50 text-slate-800 border-slate-200"
                >
                  <Package className="h-3 w-3" />
                  Boarding checkout
                </Badge>
              ) : null}
            </div>
            <p className="text-lg font-semibold tabular-nums">
              AED {a.price != null ? a.price.toFixed(0) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Payment:{" "}
              <span className="text-foreground font-medium">
                {groomingPaymentMethodLabel(a.payment_method)}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Groomer:{" "}
              <span className="text-foreground font-medium">
                {groomerDisplay(a)}
              </span>
            </p>
            {groomingDate ? (
              <p className="text-xs text-muted-foreground">
                Grooming date: <span className="text-foreground">{groomingDate}</span>
              </p>
            ) : null}

            <div className="flex flex-col gap-2 lg:items-end" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="w-full lg:w-auto"
                onClick={() => onPrint(a.id)}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print card
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const GroomingPage = () => {
  const [searchParams] = useSearchParams();
  const [day, setDay] = useState(() => new Date());

  const dateParam = searchParams.get("date");
  useEffect(() => {
    if (!dateParam) return;
    if (dateParam === "today") {
      setDay((prev) => {
        const next = new Date();
        return format(prev, "yyyy-MM-dd") === format(next, "yyyy-MM-dd") ? prev : next;
      });
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setDay(parseISO(dateParam));
    }
  }, [dateParam]);

  const dateStr = format(day, "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [groomingTab, setGroomingTab] = useState("day");
  const { data: dayAppointments = [], isLoading: dayLoading } =
    useGroomingAppointments(dateStr);
  const { data: groomingStations = [], isLoading: stationsLoading, isError: stationsError } =
    useGroomingStations();
  const { data: stationBlocks = [] } = useGroomingStationBlocks(dateStr);
  const createStationBlock = useCreateGroomingStationBlock();
  const deleteStationBlock = useDeleteGroomingStationBlock();
  const logScheduleOverrides = useLogGroomingScheduleOverrides();
  const [historySearch, setHistorySearch] = useState("");
  const historySearchActive = historySearch.trim().length >= 2;
  const { data: historyAppointments = [], isFetching: historyListFetching } =
    useGroomingHistoryList(todayStr, groomingTab === "history" && !historySearchActive);
  const { data: searchResults = [], isFetching: searchFetching } =
    useGroomingGlobalSearch(historySearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [slotPrefill, setSlotPrefill] = useState<GroomingSlotPrefill | null>(null);
  const [dayViewLayout, setDayViewLayout] = useState<"calendar" | "list" | "board">("calendar");
  const [blockDialog, setBlockDialog] = useState<{
    stationId: string;
    stationName: string;
    defaultStart?: string;
    defaultEnd?: string;
  } | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<GroomingStationBlockRow | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<GroomingScheduleConflict[]>([]);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [serviceSearch, setServiceSearch] = useState("");
  const [eodReportOpen, setEodReportOpen] = useState(false);

  const navigate = useNavigate();
  const { session } = useAuth();
  const statusTransition = useGroomingStatusTransition();
  const deleteGroomingAppt = useDeleteGroomingAppointment();
  const processPayment = useProcessPayment();
  const updateAppt = useUpdateGroomingAppointment();

  const [actionAppt, setActionAppt] = useState<GroomingAppointmentWithJoins | null>(null);
  const [editAppt, setEditAppt] = useState<GroomingAppointmentWithJoins | null>(null);
  const [paymentAppt, setPaymentAppt] = useState<GroomingAppointmentWithJoins | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GroomingAppointmentWithJoins | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroomingAppointmentWithJoins | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [paymentStaffName, setPaymentStaffName] = useState("Front desk");
  const [splitPayOpen, setSplitPayOpen] = useState(false);

  // Mark a grooming appointment's payment as recorded through the new
  // invoice_payments model so we can backfill/retire the legacy column.
  const markGroomingPaymentMigrated = async (appointmentId: string) => {
    const { error } = await supabase
      .from("grooming_appointments")
      .update({ payment_migrated: true })
      .eq("id", appointmentId);
    if (error) {
      // Non-fatal: payment succeeded; flag can be re-applied on next payment.
      console.warn("Could not set grooming payment_migrated", error.message);
    }
  };

  const [editSelectedServices, setEditSelectedServices] = useState<GroomingServiceCheckbox[]>([
    "full_groom",
  ]);
  const [editApptDate, setEditApptDate] = useState<Date>(new Date());
  const [editGroomingDate, setEditGroomingDate] = useState<Date>(new Date());
  const [editApptTime, setEditApptTime] = useState("10:00");
  const [editDurationMin, setEditDurationMin] = useState(60);
  const [editStationId, setEditStationId] = useState<string | null>(null);
  const [editGroomerName, setEditGroomerName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editVisitNotes, setEditVisitNotes] = useState("");

  const eodApptIds = useMemo(() => dayAppointments.map((a) => a.id), [dayAppointments]);
  const { data: eodInvoices = [], isFetching: eodInvoicesLoading } = useGroomingDayInvoices(
    eodApptIds,
    { enabled: eodReportOpen },
  );

  const { data: panelInvoice } = useInvoiceForGroomingAppointment(actionAppt?.id ?? null);
  const { data: payInvoice, isLoading: payInvoiceLoading } =
    useInvoiceForGroomingAppointment(paymentAppt?.id ?? null);

  const payInvoiceTotals = useMemo(
    () =>
      payInvoice
        ? invoiceDisplayTotals({
            total: payInvoice.total ?? 0,
            vat_aed: payInvoice.vat_aed,
          })
        : null,
    [payInvoice],
  );

  const eodStatusCounts = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let cancelled = 0;
    for (const a of dayAppointments) {
      const b = eodAppointmentStatusBucket(a.status);
      if (b === "cancelled") cancelled++;
      else if (b === "completed") completed++;
      else pending++;
    }
    return { completed, pending, cancelled, total: dayAppointments.length };
  }, [dayAppointments]);

  const eodPaidTotal = useMemo(() => sumGroomingInvoicePaidAed(eodInvoices), [eodInvoices]);
  const eodPendingTotal = useMemo(() => sumGroomingInvoicePendingAed(eodInvoices), [eodInvoices]);

  const openNewSheet = () => {
    setSlotPrefill(null);
    setSheetOpen(true);
  };

  const openNewSheetFromSlot = (slotStationId: string, timeHHMM: string) => {
    setSlotPrefill({ stationId: slotStationId, time: timeHHMM });
    setSheetOpen(true);
  };

  const scheduleConflictSourceAppointments = useMemo(
    () =>
      dayAppointments.filter(
        (a) => normalizeGroomingWorkflowStatus(a.status) !== "cancelled",
      ),
    [dayAppointments],
  );

  const checkScheduleConflicts = (
    args: {
      stationId: string | null;
      appointmentDate: string;
      appointmentTime: string;
      durationMinutes: number;
      excludeAppointmentId?: string;
    },
  ) =>
    findGroomingScheduleConflicts({
      ...args,
      appointments: scheduleConflictSourceAppointments,
      blocks: stationBlocks,
    });

  const persistScheduleOverrides = async (
    appointmentId: string,
    conflicts: GroomingScheduleConflict[],
    reason: string,
  ) => {
    if (conflicts.length === 0) return;
    await logScheduleOverrides.mutateAsync(
      conflicts.map((c) => ({
        appointment_id: appointmentId,
        conflict_type: c.conflictType,
        conflicted_with_id: c.conflictedWithId,
        reason,
      })),
    );
  };

  useEffect(() => {
    if (!editAppt) return;
    setEditSelectedServices(serviceCheckboxValuesFromAppointment(editAppt));
    setEditApptDate(parseISO(editAppt.appointment_date));
    const gd = parseGroomingMeta(editAppt.notes).groomingDate;
    setEditGroomingDate(gd ? parseISO(gd) : parseISO(editAppt.appointment_date));
    setEditApptTime(appointmentTimeToInputValue(editAppt.appointment_time));
    setEditDurationMin(editAppt.duration_minutes ?? 60);
    setEditStationId(editAppt.station_id ?? null);
    setEditGroomerName(editAppt.grooming_notes ?? "");
    setEditPrice(editAppt.price != null ? String(editAppt.price) : "");
    setEditVisitNotes(userVisitNotesFromStored(editAppt.notes));
  }, [editAppt]);

  useEffect(() => {
    const max = maxDurationMinutesForTimeInput(editApptTime);
    if (max > 0 && editDurationMin > max) setEditDurationMin(max);
  }, [editApptTime, editDurationMin]);

  const timeToDb = (t: string) => {
    const parts = t.split(":");
    const h = parts[0] ?? "10";
    const m = parts[1] ?? "00";
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
  };

  const performSaveEdit = async (overrideReason?: string) => {
    if (!editAppt || updateAppt.isPending) return;
    if (editSelectedServices.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(editApptTime)) {
      toast.error("Enter a valid appointment time.");
      return;
    }
    const scheduleErr = validateGroomingScheduleTime(editApptTime, editDurationMin);
    if (scheduleErr) {
      toast.error(scheduleErr);
      return;
    }
    const primaryCb = resolvePrimaryGroomingCheckbox(
      editSelectedServices.filter(isGroomingPricingCheckbox),
    );
    const primaryService = primaryCb ? groomingPricingCheckboxToDbService(primaryCb) : null;
    if (!primaryService) {
      toast.error("Could not resolve a valid service.");
      return;
    }
    const priceNum = parseFloat(editPrice);
    const finalPrice =
      Number.isFinite(priceNum) && priceNum >= 0 ? Number(priceNum.toFixed(2)) : NaN;
    if (Number.isNaN(finalPrice)) {
      toast.error("Enter a valid price.");
      return;
    }
    const selectedServiceLabels = editSelectedServices
      .map((svc) =>
        GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.value === svc)?.label ?? svc,
      )
      .join(", ");
    const metaNotes = [
      selectedServiceLabels ? `Services: ${selectedServiceLabels}` : null,
      `Grooming date: ${format(editGroomingDate, "yyyy-MM-dd")}`,
      `Estimated pickup: ${estimatedPickupFromStartAndDuration(editApptTime, editDurationMin)}`,
    ].filter(Boolean);
    const composedNotes = [editVisitNotes.trim(), ...metaNotes].filter(Boolean).join("\n");

    const conflicts = checkScheduleConflicts({
      stationId: editStationId,
      appointmentDate: format(editApptDate, "yyyy-MM-dd"),
      appointmentTime: editApptTime,
      durationMinutes: editDurationMin,
      excludeAppointmentId: editAppt.id,
    });
    if (conflicts.length > 0 && !overrideReason) {
      setPendingConflicts(conflicts);
      setConflictDialogOpen(true);
      return;
    }

    updateAppt.mutate(
      {
        id: editAppt.id,
        appointment_date: format(editApptDate, "yyyy-MM-dd"),
        appointment_time: timeToDb(editApptTime),
        duration_minutes: editDurationMin,
        station_id: editStationId,
        service: primaryService,
        grooming_notes: editGroomerName.trim() || null,
        price: finalPrice,
        notes: composedNotes || null,
      },
      {
        onSuccess: async (data) => {
          if (overrideReason && conflicts.length > 0) {
            try {
              await persistScheduleOverrides(data.id, conflicts, overrideReason);
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "Saved, but override audit log failed.",
              );
            }
          }
          toast.success("Appointment updated.");
          setEditAppt(null);
          setActionAppt(null);
          setConflictDialogOpen(false);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save changes."),
      },
    );
  };

  const handleSaveEdit = () => {
    void performSaveEdit();
  };

  const handleDeleteGroomingAppt = () => {
    if (!deleteTarget || !deleteReason.trim()) return;
    const ownerName = deleteTarget.owners
      ? ownerDisplayName(deleteTarget.owners.first_name, deleteTarget.owners.last_name)
      : "Unknown";
    deleteGroomingAppt.mutate(
      {
        appointmentId: deleteTarget.id,
        appointmentDate: deleteTarget.appointment_date,
        petName: deleteTarget.pets?.name ?? "Unknown",
        ownerName,
        service: serviceLabel(deleteTarget.service),
        price: deleteTarget.price,
        reason: deleteReason.trim(),
        deletedByEmail: session?.user?.email ?? "unknown",
      },
      {
        onSuccess: () => {
          toast.success("Appointment deleted");
          setDeleteTarget(null);
          setDeleteReason("");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not delete appointment."),
      },
    );
  };

  const sortedHistory = useMemo(() => {
    const source = historySearchActive ? searchResults : historyAppointments;
    return [...source].sort((a, b) => {
      const d =
        b.appointment_date.localeCompare(a.appointment_date) ||
        (b.appointment_time ?? "").localeCompare(a.appointment_time ?? "");
      return d;
    });
  }, [historySearchActive, searchResults, historyAppointments]);
  const historyTableFetching = historySearchActive ? searchFetching : historyListFetching;
  const serviceMatches = (
    a: GroomingAppointmentWithJoins,
    exactFilter: string,
    textFilter: string,
  ) => {
    const labels = appointmentServiceLabels(a);
    const byChip =
      exactFilter === "all" ||
      labels.some((label) => chipMatchesServiceFilter(label, exactFilter));
    const q = textFilter.trim().toLowerCase();
    const byText = !q || labels.some((label) => label.toLowerCase().includes(q));
    return byChip && byText;
  };
  const filteredDayAppointments = useMemo(
    () =>
      dayAppointments
        .filter((a) => normalizeGroomingWorkflowStatus(a.status) !== "cancelled")
        .filter((a) => serviceMatches(a, serviceFilter, serviceSearch)),
    [dayAppointments, serviceFilter, serviceSearch],
  );
  const hiddenByFilterCount = useMemo(() => {
    const active = dayAppointments.filter(
      (a) => normalizeGroomingWorkflowStatus(a.status) !== "cancelled",
    );
    return active.length - filteredDayAppointments.length;
  }, [dayAppointments, filteredDayAppointments.length]);
  const filteredHistory = useMemo(
    () =>
      sortedHistory.filter((a) =>
        serviceMatches(a, serviceFilter, serviceSearch),
      ),
    [sortedHistory, serviceFilter, serviceSearch],
  );

  return (
    <>
      <TopBar title="Grooming" />
      <Dialog open={eodReportOpen} onOpenChange={setEodReportOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle className="pr-8">End of Day Report — Grooming</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {format(day, "EEEE, d MMMM yyyy")} · {eodStatusCounts.total} appointment
              {eodStatusCounts.total === 1 ? "" : "s"}
            </p>
          </DialogHeader>
          <div
            id="grooming-eod-report-root"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-semibold tabular-nums">{eodStatusCounts.completed}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold tabular-nums">{eodStatusCounts.pending}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Cancelled</p>
                <p className="text-2xl font-semibold tabular-nums">{eodStatusCounts.cancelled}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold tabular-nums">{eodStatusCounts.total}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-3">
                <p className="text-xs font-medium text-emerald-900">
                  Revenue collected (paid invoices)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-950">
                  {eodInvoicesLoading ? "…" : formatAed(eodPaidTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3">
                <p className="text-xs font-medium text-amber-950">
                  Revenue pending (unpaid / draft invoices)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-amber-950">
                  {eodInvoicesLoading ? "…" : formatAed(eodPendingTotal)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Appointments</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pet</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Dog size</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayAppointments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No appointments for this date.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dayAppointments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.pets?.name ?? "—"}</TableCell>
                          <TableCell>
                            {a.owners
                              ? ownerDisplayName(a.owners.first_name, a.owners.last_name)
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">
                            {appointmentServiceLabels(a).join(" · ")}
                          </TableCell>
                          <TableCell>—</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.price != null ? formatAed(a.price) : "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex rounded border px-2 py-0.5 text-xs font-medium",
                                workflowStatusBadgeClass(a.status),
                              )}
                            >
                              {workflowStatusLabel(a.status)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-3 print:hidden">
            <Button type="button" variant="outline" onClick={() => setEodReportOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous day"
              onClick={() => setDay((d) => subDays(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold min-w-[12rem]">
              {format(day, "EEEE, d MMMM yyyy")}
            </h2>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next day"
              onClick={() => setDay((d) => addDays(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDay(new Date())}
            >
              Today
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEodReportOpen(true)}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              End of Day Report
            </Button>
            <Button type="button" onClick={openNewSheet}>
              <Plus className="mr-2 h-4 w-4" />
              New Appointment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(`/print/grooming-cards?date=${dateStr}`, "_blank", "noopener,noreferrer")
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Print today's cards
            </Button>
          </div>
        </div>

        <Tabs value={groomingTab} onValueChange={setGroomingTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="day">Day View</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Service filters</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={serviceFilter === "all" ? "default" : "outline"}
                onClick={() => setServiceFilter("all")}
              >
                All services
              </Button>
              {GROOMING_SERVICE_CHECKBOX_OPTIONS.map((o) => (
                <Button
                  key={`service-filter-${o.value}`}
                  type="button"
                  size="sm"
                  variant={serviceFilter === o.label ? "default" : "outline"}
                  onClick={() => setServiceFilter(o.label)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <Input
              className="max-w-md"
              placeholder="Search service name..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
            />
          </div>

          <TabsContent value="day" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={dayViewLayout === "calendar" ? "default" : "outline"}
                onClick={() => setDayViewLayout("calendar")}
              >
                Calendar
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dayViewLayout === "list" ? "default" : "outline"}
                onClick={() => setDayViewLayout("list")}
              >
                List
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="grooming-day-board-tab"
                variant={dayViewLayout === "board" ? "default" : "outline"}
                onClick={() => setDayViewLayout("board")}
              >
                Capacity board
              </Button>
            </div>

            {dayViewLayout === "board" && (
              <GroomingDayBoard
                initialDate={dateStr}
                staffLabel={session?.user?.email ?? "staff"}
                onAppointmentClick={(id) => {
                  const found = dayAppointments.find((a) => a.id === id);
                  if (found) setActionAppt(found);
                }}
              />
            )}

            {dayViewLayout === "calendar" && (
              <>
                {dayLoading || stationsLoading ? (
                  <Skeleton className="h-[480px] w-full" />
                ) : (
                  <GroomingStationCalendar
                    stations={groomingStations}
                    blocks={stationBlocks}
                    appointments={filteredDayAppointments}
                    hiddenByFilterCount={hiddenByFilterCount}
                    stationsUnavailable={stationsError}
                    onEmptySlotClick={openNewSheetFromSlot}
                    onAppointmentClick={setActionAppt}
                    onBlockClick={setUnblockTarget}
                    onRequestBlockStation={(id, slotTime) => {
                      const station = groomingStations.find((s) => s.id === id);
                      if (!station) return;
                      const endMinutes = slotTime
                        ? maxDurationMinutesForTimeInput(slotTime)
                        : 60;
                      const endHour = slotTime
                        ? (() => {
                            const [h, m] = slotTime.split(":").map(Number);
                            const total = h * 60 + m + Math.min(60, endMinutes);
                            return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                          })()
                        : "17:00";
                      setBlockDialog({
                        stationId: id,
                        stationName: station.name,
                        defaultStart: slotTime ?? "09:00",
                        defaultEnd: endHour,
                      });
                    }}
                  />
                )}
              </>
            )}

            {dayViewLayout === "list" && (
              <>
                {dayLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : filteredDayAppointments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-16">
                    No grooming appointments match the selected service filters for{" "}
                    {format(day, "EEEE, d MMMM yyyy")}.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredDayAppointments.map((a) => (
                      <AppointmentCard
                        key={a.id}
                        a={a}
                        onOpenActions={setActionAppt}
                        onPrint={(appointmentId) =>
                          window.open(
                            `/print/grooming-card/${appointmentId}`,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="max-w-md">
              <Label className="text-xs text-muted-foreground">
                Search by pet or owner (optional)
              </Label>
              <Input
                className="mt-1"
                placeholder="Filter by pet or owner name…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            {historySearch.trim().length > 0 && historySearch.trim().length < 2 && (
              <p className="text-sm text-muted-foreground">
                Enter at least 2 characters to filter the list.
              </p>
            )}
            {historyTableFetching && <Skeleton className="h-40 w-full" />}
            {!historyTableFetching && (historySearchActive || historySearch.trim().length === 0) && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Pet</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Groomer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No appointments match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHistory.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(r.appointment_date), "d MMM yyyy")}
                          </TableCell>
                          <TableCell>{r.pets?.name ?? "—"}</TableCell>
                          <TableCell>
                            {r.owners
                              ? ownerDisplayName(r.owners.first_name, r.owners.last_name)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p>{serviceLabel(r.service)}</p>
                              {parseGroomingMeta(r.notes).services
                                .filter(
                                  (s) =>
                                    s.toLowerCase() !==
                                    serviceLabel(r.service).toLowerCase(),
                                )
                                .slice(0, 3)
                                .map((s) => (
                                  <p
                                    key={`${r.id}-${s}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    + {s}
                                  </p>
                                ))}
                            </div>
                          </TableCell>
                          <TableCell>{groomerDisplay(r)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-normal border",
                                workflowStatusBadgeClass(r.status),
                              )}
                            >
                              {workflowStatusLabel(r.status)}
                              {r.no_show ? " · No show" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.price != null ? `AED ${r.price}` : "—"}
                          </TableCell>
                          <TableCell>
                            {normalizeGroomingWorkflowStatus(r.status) === "cancelled" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeleteTarget(r);
                                  setDeleteReason("");
                                }}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Delete
                              </Button>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cancelled appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the appointment and its status history. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="grooming-delete-reason">
              Reason for deletion <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="grooming-delete-reason"
              placeholder="Enter reason..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteTarget(null);
                setDeleteReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteReason.trim() || deleteGroomingAppt.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteGroomingAppt();
              }}
            >
              {deleteGroomingAppt.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              The slot will be marked as cancelled. It will appear in the History tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!cancelTarget) return;
                statusTransition.mutate(
                  { id: cancelTarget.id, toStatus: "cancelled" },
                  {
                    onSuccess: () => {
                      toast.success("Appointment cancelled.");
                      setCancelTarget(null);
                      setActionAppt(null);
                    },
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Could not cancel."),
                  },
                );
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!actionAppt} onOpenChange={(o) => !o && setActionAppt(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Grooming appointment</SheetTitle>
            <SheetDescription>
              {actionAppt
                ? `${actionAppt.pets?.name ?? "Pet"} · ${actionAppt.owners ? ownerDisplayName(actionAppt.owners.first_name, actionAppt.owners.last_name) : "—"}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          {actionAppt && (
            <div className="mt-6 flex flex-col gap-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={cn("border font-medium", workflowStatusBadgeClass(actionAppt.status))}
                >
                  {workflowStatusLabel(actionAppt.status)}
                </Badge>
              </div>

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "new" && (
                <>
                  <Button
                    disabled={statusTransition.isPending}
                    onClick={() =>
                      statusTransition.mutate(
                        { id: actionAppt.id, toStatus: "checked_in" },
                        {
                          onSuccess: () => toast.success("Checked in."),
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Update failed."),
                        },
                      )
                    }
                  >
                    Check In
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setCancelTarget(actionAppt)}>
                    Cancel
                  </Button>
                </>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "checked_in" && (
                <>
                  <Button
                    disabled={statusTransition.isPending}
                    onClick={() =>
                      statusTransition.mutate(
                        { id: actionAppt.id, toStatus: "in_progress" },
                        {
                          onSuccess: () => toast.success("Started."),
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Update failed."),
                        },
                      )
                    }
                  >
                    Start
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setCancelTarget(actionAppt)}>
                    Cancel
                  </Button>
                </>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "in_progress" && (
                <>
                  <Button
                    disabled={statusTransition.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() =>
                      statusTransition.mutate(
                        { id: actionAppt.id, toStatus: "completed" },
                        {
                          onSuccess: () => toast.success("Completed."),
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Update failed."),
                        },
                      )
                    }
                  >
                    Complete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "completed" && (
                <>
                  <Button
                    onClick={() => {
                      setPaymentAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Take Payment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "paid" && (
                <>
                  <Button
                    variant="outline"
                    disabled={!panelInvoice?.id}
                    onClick={() => {
                      if (panelInvoice?.id) {
                        navigate(`/billing/invoices/${panelInvoice.id}`);
                        setActionAppt(null);
                      }
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View Invoice
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditAppt(actionAppt);
                      setActionAppt(null);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "cancelled" && (
                <p className="text-sm text-muted-foreground">This appointment was cancelled.</p>
              )}

              {normalizeGroomingWorkflowStatus(actionAppt.status) === "other" && (
                <p className="text-sm text-muted-foreground">
                  This record uses a legacy or unknown status. Use Edit to align services and notes,
                  or Undo if available.
                </p>
              )}

              {workflowUndoTarget(actionAppt.status) && (
                <Button
                  variant="ghost"
                  className="mt-2 text-muted-foreground"
                  disabled={statusTransition.isPending}
                  onClick={() => {
                    const prev = workflowUndoTarget(actionAppt.status);
                    if (!prev) return;
                    statusTransition.mutate(
                      { id: actionAppt.id, toStatus: prev, isUndo: true },
                      {
                        onSuccess: () => toast.success(`Reverted to ${workflowStatusLabel(prev)}.`),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Could not undo."),
                      },
                    );
                  }}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Undo last step
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!paymentAppt} onOpenChange={(o) => !o && setPaymentAppt(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Take payment</SheetTitle>
            <SheetDescription>
              Record cash or card against the grooming invoice. Status moves to Paid on success.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {paymentAppt && (
              <p className="text-sm">
                <span className="font-medium">{paymentAppt.pets?.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatApptTime(paymentAppt.appointment_time)}
                </span>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="payment-staff">Recorded by</Label>
              <Input
                id="payment-staff"
                value={paymentStaffName}
                onChange={(e) => setPaymentStaffName(e.target.value)}
                placeholder="Staff name"
              />
            </div>
            {payInvoiceLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading invoice…
              </div>
            ) : !payInvoice ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                No invoice linked to this appointment. Draft invoices are normally created when the
                appointment is booked; you can add one from Billing if needed.
              </p>
            ) : (
              <>
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Invoice</p>
                  <p className="font-mono text-sm">{payInvoice.invoice_number ?? payInvoice.id.slice(0, 8)}</p>
                  {payInvoiceTotals ? (
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Subtotal (before VAT)</span>
                        <span className="tabular-nums">{formatAed(payInvoiceTotals.netExVat)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{vatLineLabel()}</span>
                        <span className="tabular-nums">{formatAed(payInvoiceTotals.vat)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-base font-semibold border-t pt-1">
                        <span>Grand total</span>
                        <span className="tabular-nums">{formatAed(payInvoiceTotals.grandTotal)}</span>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground capitalize">
                    Status: {payInvoice.status.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    disabled={processPayment.isPending || statusTransition.isPending}
                    onClick={async () => {
                      if (!paymentAppt || !payInvoice) return;
                      try {
                        if (payInvoice.status === "paid") {
                          await statusTransition.mutateAsync({
                            id: paymentAppt.id,
                            toStatus: "paid",
                          });
                          toast.success("Appointment marked paid.");
                          setPaymentAppt(null);
                          return;
                        }
                        await processPayment.mutateAsync({
                          invoiceId: payInvoice.id,
                          method: "cash",
                          staffName: paymentStaffName.trim() || "Front desk",
                        });
                        await markGroomingPaymentMigrated(paymentAppt.id);
                        await statusTransition.mutateAsync({
                          id: paymentAppt.id,
                          toStatus: "paid",
                        });
                        setPaymentAppt(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Payment failed.");
                      }
                    }}
                  >
                    {processPayment.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Mark paid (cash)
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={processPayment.isPending || statusTransition.isPending}
                    onClick={async () => {
                      if (!paymentAppt || !payInvoice) return;
                      try {
                        if (payInvoice.status === "paid") {
                          await statusTransition.mutateAsync({
                            id: paymentAppt.id,
                            toStatus: "paid",
                          });
                          toast.success("Appointment marked paid.");
                          setPaymentAppt(null);
                          return;
                        }
                        await processPayment.mutateAsync({
                          invoiceId: payInvoice.id,
                          method: "card",
                          staffName: paymentStaffName.trim() || "Front desk",
                        });
                        await markGroomingPaymentMigrated(paymentAppt.id);
                        await statusTransition.mutateAsync({
                          id: paymentAppt.id,
                          toStatus: "paid",
                        });
                        setPaymentAppt(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Payment failed.");
                      }
                    }}
                  >
                    {processPayment.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Mark paid (card)
                  </Button>
                  {payInvoice.status !== "paid" ? (
                    <Button
                      variant="outline"
                      disabled={processPayment.isPending || statusTransition.isPending}
                      onClick={() => setSplitPayOpen(true)}
                      data-testid="grooming-pay-split-btn"
                    >
                      Pay with account balance…
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {paymentAppt && payInvoice && payInvoiceTotals ? (
        <PaymentSplitDialog
          open={splitPayOpen}
          onOpenChange={setSplitPayOpen}
          invoiceId={payInvoice.id}
          ownerId={paymentAppt.owner_id}
          invoiceTotal={payInvoiceTotals.grandTotal}
          defaultStaffName={paymentStaffName}
          title="Collect grooming payment"
          onSuccess={async () => {
            if (!paymentAppt) return;
            await markGroomingPaymentMigrated(paymentAppt.id);
            await statusTransition.mutateAsync({
              id: paymentAppt.id,
              toStatus: "paid",
            });
            setSplitPayOpen(false);
            setPaymentAppt(null);
          }}
        />
      ) : null}

      <Sheet open={!!editAppt} onOpenChange={(o) => !o && setEditAppt(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit appointment</SheetTitle>
            <SheetDescription>
              Update services, schedule, groomer, notes, and price. Saves to the database immediately.
            </SheetDescription>
          </SheetHeader>
          {editAppt && (
            <div className="mt-6 space-y-6">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Client · Pet · </span>
                <span className="font-medium">
                  {editAppt.owners
                    ? ownerDisplayName(editAppt.owners.first_name, editAppt.owners.last_name)
                    : "—"}
                  {" · "}
                  {editAppt.pets?.name ?? "—"}
                </span>
              </div>
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Appointment details
                </h3>
                <div className="space-y-2">
                  <Label>Service</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                    {GROOMING_SERVICE_CHECKBOX_OPTIONS.map((o) => {
                      const checked = editSelectedServices.includes(o.value);
                      return (
                        <label
                          key={o.value}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const shouldCheck = e.target.checked;
                              setEditSelectedServices((prev) => {
                                if (shouldCheck) {
                                  if (prev.includes(o.value)) return prev;
                                  return [...prev, o.value];
                                }
                                return prev.filter((v) => v !== o.value);
                              });
                            }}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Appointment Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !editApptDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(editApptDate, "d MMM yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editApptDate}
                          onSelect={(d) => d && setEditApptDate(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Grooming Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !editGroomingDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(editGroomingDate, "d MMM yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editGroomingDate}
                          onSelect={(d) => d && setEditGroomingDate(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={editApptTime}
                      onChange={(e) => setEditApptTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Station</Label>
                    <Select
                      value={editStationId ?? "__none__"}
                      onValueChange={(v) => setEditStationId(v === "__none__" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select station" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {groomingStations.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      min={15}
                      step={5}
                      value={editDurationMin}
                      onChange={(e) =>
                        setEditDurationMin(parseInt(e.target.value, 10) || 60)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (AED)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Groomer</Label>
                  <Input
                    value={editGroomerName}
                    onChange={(e) => setEditGroomerName(e.target.value)}
                    placeholder="Groomer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editVisitNotes}
                    onChange={(e) => setEditVisitNotes(e.target.value)}
                    placeholder="Visit instructions…"
                    rows={3}
                  />
                </div>
              </section>
              <SheetFooter className="gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setEditAppt(null)}>
                  Close
                </Button>
                <Button type="button" disabled={updateAppt.isPending} onClick={handleSaveEdit}>
                  {updateAppt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <GroomingNewAppointmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultDay={day}
        slotPrefill={slotPrefill}
        groomingStations={groomingStations}
        stationBlocks={stationBlocks}
        dayAppointments={dayAppointments}
      />

      <BlockStationDialog
        open={!!blockDialog}
        onOpenChange={(open) => !open && setBlockDialog(null)}
        stationName={blockDialog?.stationName ?? ""}
        blockDate={dateStr}
        defaultStartTime={blockDialog?.defaultStart}
        defaultEndTime={blockDialog?.defaultEnd}
        isPending={createStationBlock.isPending}
        onSubmit={({ isFullDay, startTime, endTime, reason }) => {
          if (!blockDialog) return;
          createStationBlock.mutate(
            {
              station_id: blockDialog.stationId,
              block_date: dateStr,
              is_full_day: isFullDay,
              start_time: isFullDay ? null : `${startTime}:00`,
              end_time: isFullDay ? null : `${endTime}:00`,
              reason,
            },
            {
              onSuccess: () => {
                toast.success("Station blocked.");
                setBlockDialog(null);
              },
              onError: (e) =>
                toast.error(e instanceof Error ? e.message : "Could not block station."),
            },
          );
        }}
      />

      <GroomingConflictOverrideDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={pendingConflicts}
        isPending={updateAppt.isPending || logScheduleOverrides.isPending}
        onConfirm={(reason) => {
          void performSaveEdit(reason);
        }}
      />

      <AlertDialog
        open={!!unblockTarget}
        onOpenChange={(open) => !open && setUnblockTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock station?</AlertDialogTitle>
            <AlertDialogDescription>
              {unblockTarget?.reason
                ? `Remove block: ${unblockTarget.reason}`
                : "Remove this station block?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!unblockTarget) return;
                deleteStationBlock.mutate(
                  { id: unblockTarget.id, blockDate: unblockTarget.block_date },
                  {
                    onSuccess: () => {
                      toast.success("Station unblocked.");
                      setUnblockTarget(null);
                    },
                    onError: (e) =>
                      toast.error(
                        e instanceof Error ? e.message : "Could not unblock station.",
                      ),
                  },
                );
              }}
            >
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GroomingPage;
