import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addMinutes,
  addDays,
  format,
  parse,
  parseISO,
  subDays,
} from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { ownerDisplayName, createServiceInvoice } from "@/lib/bookingUtils";
import { groomingServiceToPricingKey } from "@/lib/addonPricing";
import { useOwner } from "@/hooks/useOwners";
import { OwnerClientSearch } from "@/components/OwnerClientSearch";
import { usePets } from "@/hooks/usePets";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  useGroomingAppointments,
  useGroomingHistoryList,
  useGroomingGlobalSearch,
  useCreateGroomingAppointment,
  useDeleteGroomingAppointment,
  useUpdateGroomingAppointment,
  useGroomingStatusTransition,
  useInvoiceForGroomingAppointment,
  useBookingsForGroomingLink,
  useGroomingDayInvoices,
  sumGroomingInvoicePaidAed,
  sumGroomingInvoicePendingAed,
  useLastGroomingDateByPetIds,
  type GroomingAppointmentWithJoins,
  type BookingLinkRow,
} from "@/hooks/useGrooming";
import { useProcessPayment, formatAed } from "@/hooks/useBilling";
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
  GROOMING_PAYMENT_METHOD_NONE,
  GROOMING_PAYMENT_METHOD_OPTIONS,
  groomingPaymentMethodLabel,
  parseGroomingPaymentMethodSelectValue,
  type GroomingPaymentMethod,
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
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import {
  largestDogSizeFormValue,
  petSizeToDogSizeFormValue,
} from "@/lib/dogSizeForm";
import {
  clampMattingFeeAed,
  clampHeavyDogFeeAed,
  groomingPricingCheckboxToDbService,
  isGroomingPricingCheckbox,
  resolvePrimaryGroomingCheckbox,
} from "@/lib/groomingNewAppointmentPricing";
import { useGroomingManualFeeBounds } from "@/hooks/useGroomingManualFeeBounds";
import { useNewGroomingAppointmentPrice } from "@/hooks/useNewGroomingAppointmentPrice";
import { PetSafetyNotesBanner } from "@/components/grooming/PetSafetyNotesBanner";
import { VisitNotesField } from "@/components/grooming/VisitNotesField";
import { fetchCheckboxBasePriceAed } from "@/lib/groomingNewAppointmentRates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

type GroomingServiceCheckbox =
  | "full_groom"
  | "deshedding"
  | "bath_only"
  | "full_bath_full"
  | "fur_brushing"
  | "teeth_brushing"
  | "nail_clip"
  | "blow_dry"
  | "ear_cleaning"
  | "pawdicure"
  | "paw_wash"
  | "malaseb_bath"
  | "matting_fee"
  | "heavy_dog_fee";

const DISCOUNT_QUICK_PCTS = [5, 10, 15, 20, 25, 30, 50, 100] as const;

const GROOMING_SERVICE_CHECKBOX_OPTIONS: Array<{
  value: GroomingServiceCheckbox;
  label: string;
  mapsTo: GroomingService;
  /** Optional AED range for staff-entered add-on amounts */
  manualPriceRange?: { min: number; max: number; default: number };
}> = [
  { value: "full_groom", label: "Full groom", mapsTo: "full_groom" },
  { value: "deshedding", label: "Deshedding", mapsTo: "deshedding" },
  { value: "bath_only", label: "Bath only", mapsTo: "full_bath" },
  { value: "full_bath_full", label: "Full bath", mapsTo: "full_bath" },
  { value: "fur_brushing", label: "Fur brushing", mapsTo: "brushing" },
  { value: "teeth_brushing", label: "Teeth brushing", mapsTo: "brushing" },
  { value: "nail_clip", label: "Nail clip", mapsTo: "nail_clip" },
  { value: "blow_dry", label: "Blow dry", mapsTo: "full_bath" },
  { value: "ear_cleaning", label: "Ear cleaning", mapsTo: "brushing" },
  { value: "pawdicure", label: "Pawdicure", mapsTo: "pawdicure" },
  { value: "paw_wash", label: "Paw wash", mapsTo: "pawdicure" },
  { value: "malaseb_bath", label: "Malaseb bath", mapsTo: "full_bath" },
  { value: "matting_fee", label: "Matting fee", mapsTo: "brushing" },
  { value: "heavy_dog_fee", label: "Heavy dog fee", mapsTo: "brushing" },
];

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

/** Matches saved `Services:` tokens like `Matting fee (AED 80)` to a checkbox/filter label. */
function serviceTokenMatchesSavedOption(savedToken: string, optionLabel: string): boolean {
  const t = savedToken.trim().toLowerCase();
  const l = optionLabel.toLowerCase();
  if (t === l) return true;
  if (t.startsWith(`${l} (`)) return true;
  if (t.startsWith(`${l} —`) || t.startsWith(`${l} -`)) return true;
  return false;
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

const PET_NOTE_SAFETY_KEYWORDS = [
  "aggressive",
  "reactive",
  "anxious",
  "medical",
  "medication",
  "nervous",
  "bite",
] as const;

function petProfileTextForSafetyScan(pet: {
  grooming_notes?: string | null;
  other_notes?: string | null;
  special_alerts?: unknown;
}): string {
  const parts: string[] = [];
  if (pet.grooming_notes?.trim()) parts.push(pet.grooming_notes.trim());
  if (pet.other_notes?.trim()) parts.push(pet.other_notes.trim());
  if (pet.special_alerts != null) {
    try {
      parts.push(
        typeof pet.special_alerts === "string"
          ? pet.special_alerts
          : JSON.stringify(pet.special_alerts),
      );
    } catch {
      parts.push(String(pet.special_alerts));
    }
  }
  return parts.join("\n\n");
}

function petSafetyKeywordHit(fullText: string): boolean {
  if (!fullText.trim()) return false;
  const lower = fullText.toLowerCase();
  return PET_NOTE_SAFETY_KEYWORDS.some((k) => lower.includes(k));
}

function formatLastGroomedDisplayLine(isoDate: string | undefined): string {
  if (!isoDate) return "Last groomed: No record found";
  try {
    return `Last groomed: ${format(parseISO(isoDate), "d MMM yyyy")}`;
  } catch {
    return "Last groomed: No record found";
  }
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

function estimatedPickupFromStartAndDuration(timeValue: string, durationMinutes: number): string {
  if (!/^\d{2}:\d{2}$/.test(timeValue)) return "—";
  const safeMinutes =
    Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : 0;
  try {
    const start = parse(`${timeValue}:00`, "HH:mm:ss", new Date(2000, 0, 1));
    return format(addMinutes(start, safeMinutes), "h:mm a");
  } catch {
    return "—";
  }
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
  const [historySearch, setHistorySearch] = useState("");
  const historySearchActive = historySearch.trim().length >= 2;
  const { data: historyAppointments = [], isFetching: historyListFetching } =
    useGroomingHistoryList(todayStr, groomingTab === "history" && !historySearchActive);
  const { data: searchResults = [], isFetching: searchFetching } =
    useGroomingGlobalSearch(historySearch);

  const createAppt = useCreateGroomingAppointment();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [useCreditByPet, setUseCreditByPet] = useState<Record<string, boolean>>({});
  const [selectedServices, setSelectedServices] = useState<GroomingServiceCheckbox[]>([
    "full_groom",
  ]);
  const { data: manualFeeBounds } = useGroomingManualFeeBounds(sheetOpen);
  const mattingDefault =
    manualFeeBounds && manualFeeBounds.mattingMin > 0
      ? String(manualFeeBounds.mattingMin)
      : "";
  const heavyDefault =
    manualFeeBounds && manualFeeBounds.heavyMin > 0
      ? String(manualFeeBounds.heavyMin)
      : "";
  const [mattingFeeAed, setMattingFeeAed] = useState("");
  const [heavyDogFeeAed, setHeavyDogFeeAed] = useState("");
  const [dogSize, setDogSize] = useState<DogSizeFormValue | null>(null);
  const dogSizeManualRef = useRef(false);
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [groomingDate, setGroomingDate] = useState<Date>(new Date());
  const [apptTime, setApptTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(60);
  const estPickupTimeLabel = useMemo(
    () => estimatedPickupFromStartAndDuration(apptTime, durationMin),
    [apptTime, durationMin],
  );
  const [groomerName, setGroomerName] = useState("");
  const [showPreferredGroomerHint, setShowPreferredGroomerHint] = useState(false);
  const lastPrefilledOwnerIdForGroomer = useRef<string | null>(null);
  const [price, setPrice] = useState("");
  /** Empty or 0% = no discount; quick buttons and manual input share this value */
  const [discountPct, setDiscountPct] = useState("");
  const discountAutoFromMemberRef = useRef(true);
  const prevOwnerIdForMemberDiscountRef = useRef<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<GroomingPaymentMethod | null>(null);
  const [visitNotes, setVisitNotes] = useState("");
  const [linkBoarding, setLinkBoarding] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
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

  const [editSelectedServices, setEditSelectedServices] = useState<GroomingServiceCheckbox[]>([
    "full_groom",
  ]);
  const [editApptDate, setEditApptDate] = useState<Date>(new Date());
  const [editGroomingDate, setEditGroomingDate] = useState<Date>(new Date());
  const [editApptTime, setEditApptTime] = useState("10:00");
  const [editDurationMin, setEditDurationMin] = useState(60);
  const [editGroomerName, setEditGroomerName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editVisitNotes, setEditVisitNotes] = useState("");

  const { data: pets = [] } = usePets(ownerId ?? "");
  const eodApptIds = useMemo(() => dayAppointments.map((a) => a.id), [dayAppointments]);
  const { data: eodInvoices = [], isFetching: eodInvoicesLoading } = useGroomingDayInvoices(
    eodApptIds,
    { enabled: eodReportOpen },
  );
  const { data: ownerForGroomingPref } = useOwner(ownerId ?? "");
  const { data: bookingHits = [] } = useBookingsForGroomingLink(
    linkBoarding ? bookingSearch : "",
  );

  useEffect(() => {
    if (ownerId !== prevOwnerIdForMemberDiscountRef.current) {
      discountAutoFromMemberRef.current = true;
      prevOwnerIdForMemberDiscountRef.current = ownerId;
    }
  }, [ownerId]);

  useEffect(() => {
    if (!sheetOpen || !ownerId || ownerForGroomingPref?.id !== ownerId) return;
    if (!discountAutoFromMemberRef.current) return;
    const pct = 0;
    setDiscountPct(pct > 0 ? String(pct) : "");
  }, [sheetOpen, ownerId, ownerForGroomingPref]);

  useEffect(() => {
    if (!ownerId) {
      setGroomerName("");
      setShowPreferredGroomerHint(false);
      lastPrefilledOwnerIdForGroomer.current = null;
    }
  }, [ownerId]);

  useEffect(() => {
    if (!sheetOpen || !ownerId) return;
    if (!ownerForGroomingPref || ownerForGroomingPref.id !== ownerId) return;
    if (lastPrefilledOwnerIdForGroomer.current === ownerId) return;

    const pref = ownerForGroomingPref.preferred_groomer?.trim() ?? "";
    setGroomerName(pref);
    setShowPreferredGroomerHint(!!pref);
    lastPrefilledOwnerIdForGroomer.current = ownerId;
  }, [sheetOpen, ownerId, ownerForGroomingPref]);

  const { data: panelInvoice } = useInvoiceForGroomingAppointment(actionAppt?.id ?? null);
  const { data: payInvoice, isLoading: payInvoiceLoading } =
    useInvoiceForGroomingAppointment(paymentAppt?.id ?? null);

  const payInvoiceTotals = useMemo(
    () =>
      payInvoice
        ? invoiceDisplayTotals({
            total: payInvoice.total ?? payInvoice.total_aed ?? 0,
            total_aed: payInvoice.total_aed,
            vat_aed: payInvoice.vat_aed,
          })
        : null,
    [payInvoice],
  );

  const petsIdFingerprint = useMemo(
    () =>
      pets
        .map((p) => p.id)
        .sort()
        .join(","),
    [pets],
  );

  const selectedPetsOrdered = useMemo(
    () => pets.filter((p) => selectedPetIds.includes(p.id)),
    [pets, selectedPetIds],
  );

  const effectivePetCoat = useMemo(() => {
    return selectedPetsOrdered[0]?.coat_type ?? null;
  }, [selectedPetsOrdered]);

  useEffect(() => {
    if (!sheetOpen || dogSizeManualRef.current || selectedPetsOrdered.length === 0) return;
    const fromPets = selectedPetsOrdered
      .map((pet) => petSizeToDogSizeFormValue(pet.size))
      .filter((size): size is DogSizeFormValue => size != null);
    const derived = largestDogSizeFormValue(fromPets);
    if (derived) setDogSize(derived);
  }, [sheetOpen, selectedPetsOrdered]);

  const petIdsForLastGroom = useMemo(() => {
    if (selectedPetIds.length > 0) return selectedPetIds;
    if (sheetOpen && pets.length === 1) return [pets[0].id];
    return [];
  }, [selectedPetIds, sheetOpen, pets]);

  const { data: lastGroomDateByPet } = useLastGroomingDateByPetIds(petIdsForLastGroom, {
    enabled: sheetOpen && petIdsForLastGroom.length > 0,
  });
  const lastGroomMap = lastGroomDateByPet ?? new Map<string, string>();

  const petsForSafetyScan = useMemo(() => {
    if (selectedPetsOrdered.length > 0) return selectedPetsOrdered;
    if (ownerId && pets.length === 1) return pets;
    return [];
  }, [selectedPetsOrdered, ownerId, pets]);

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

  /** Single-pet owners: keep the only pet selected automatically (same UX as before). */
  useEffect(() => {
    if (!sheetOpen || !ownerId) return;
    if (pets.length === 1) {
      setSelectedPetIds([pets[0].id]);
    }
  }, [sheetOpen, ownerId, pets, petsIdFingerprint, pets.length]);

  const newApptManualAddonAed = useMemo(() => {
    const out: { matting_fee?: number; heavy_dog_fee?: number } = {};
    if (selectedServices.includes("matting_fee")) {
      const raw = parseFloat(mattingFeeAed);
      const fallback = manualFeeBounds?.mattingMin ?? 0;
      out.matting_fee = clampMattingFeeAed(
        Number.isFinite(raw) ? raw : fallback,
        manualFeeBounds,
      );
    }
    if (selectedServices.includes("heavy_dog_fee")) {
      const raw = parseFloat(heavyDogFeeAed);
      const fallback = manualFeeBounds?.heavyMin ?? 0;
      out.heavy_dog_fee = clampHeavyDogFeeAed(
        Number.isFinite(raw) ? raw : fallback,
        manualFeeBounds,
      );
    }
    return Object.keys(out).length ? out : null;
  }, [selectedServices, mattingFeeAed, heavyDogFeeAed, manualFeeBounds]);

  const { data: newApptComputedOriginalAed, isFetching: newApptPriceFetching } = useNewGroomingAppointmentPrice({
    selectedServices,
    dogSize,
    manualAddons: newApptManualAddonAed,
    petCoat: effectivePetCoat,
    bookingDate: format(apptDate, "yyyy-MM-dd"),
    enabled: sheetOpen,
  });

  const { data: servicePriceHints = {} } = useQuery({
    queryKey: [
      "grooming-checkbox-prices",
      dogSize,
      effectivePetCoat,
      format(apptDate, "yyyy-MM-dd"),
    ],
    enabled: sheetOpen && dogSize != null,
    queryFn: async () => {
      const baseOptions = GROOMING_SERVICE_CHECKBOX_OPTIONS.filter((o) =>
        ["full_groom", "deshedding", "bath_only", "full_bath_full"].includes(o.value),
      );
      const entries = await Promise.all(
        baseOptions.map(async (option) => {
          const amount = await fetchCheckboxBasePriceAed(
            option.value,
            dogSize!,
            effectivePetCoat,
            format(apptDate, "yyyy-MM-dd"),
          );
          return [option.value, amount] as const;
        }),
      );
      return Object.fromEntries(entries) as Partial<
        Record<GroomingServiceCheckbox, number | null>
      >;
    },
  });

  const newApptPriceManualRef = useRef(false);

  useEffect(() => {
    newApptPriceManualRef.current = false;
  }, [selectedServices, dogSize, effectivePetCoat]);

  const isComplimentaryPayment = paymentMethod === "complimentary";
  const selectedPrimaryServiceCode = useMemo(() => {
    const primaryCb = resolvePrimaryGroomingCheckbox(
      selectedServices.filter(isGroomingPricingCheckbox),
    );
    const primaryService = primaryCb ? groomingPricingCheckboxToDbService(primaryCb) : null;
    return (primaryService ? groomingServiceToPricingKey(primaryService) : null) as
      | Database["public"]["Enums"]["service_code"]
      | null;
  }, [selectedServices]);

  const { data: groomingCreditsByPet = {} } = useQuery<Record<string, {
    credit_id: string;
    package_name: string;
    units_remaining: number;
    expires_at: string;
  } | null>>({
    queryKey: [
      "grooming_credits",
      selectedPrimaryServiceCode,
      selectedPetsOrdered.map((p) => p.id).join(","),
    ],
    enabled: !!selectedPrimaryServiceCode && selectedPetsOrdered.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        selectedPetsOrdered.map(async (pet) => {
          const { data, error } = await supabase.rpc("list_active_credits_for_pet", {
            p_pet_id: pet.id,
            p_service_code: selectedPrimaryServiceCode,
          });
          if (error) throw error;
          const first = (data ?? [])[0] as
            | { credit_id: string; package_name: string; units_remaining: number; expires_at: string }
            | undefined;
          return [pet.id, first ?? null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  useEffect(() => {
    setUseCreditByPet((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const pet of selectedPetsOrdered) {
        if (groomingCreditsByPet[pet.id] && next[pet.id] === undefined) {
          next[pet.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedPetsOrdered, groomingCreditsByPet]);

  useEffect(() => {
    if (!sheetOpen) return;
    if (isComplimentaryPayment) {
      setPrice("0");
      return;
    }
    if (newApptPriceManualRef.current) return;
    if (newApptComputedOriginalAed == null) {
      setPrice("");
      return;
    }
    setPrice(String(newApptComputedOriginalAed));
  }, [sheetOpen, isComplimentaryPayment, newApptComputedOriginalAed]);

  const normalizedDiscountPct = useMemo(() => {
    const trimmed = discountPct.trim();
    if (trimmed === "") return 0;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
  }, [discountPct]);

  const newApptOriginalAed = useMemo(() => {
    const n = Number.parseFloat(price);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }, [price]);

  const newApptFinalAed = useMemo(() => {
    if (isComplimentaryPayment) return 0;
    if (newApptOriginalAed == null) return null;
    return Number((newApptOriginalAed * (1 - normalizedDiscountPct / 100)).toFixed(2));
  }, [isComplimentaryPayment, newApptOriginalAed, normalizedDiscountPct]);

  const newApptSaveAed = useMemo(() => {
    if (newApptOriginalAed == null || normalizedDiscountPct <= 0 || newApptFinalAed == null) {
      return null;
    }
    return Number((newApptOriginalAed - newApptFinalAed).toFixed(2));
  }, [newApptOriginalAed, newApptFinalAed, normalizedDiscountPct]);

  const openNewSheet = () => {
    setApptDate(day);
    setGroomingDate(day);
    setApptTime("10:00");
    setDurationMin(60);
    setSelectedServices(["full_groom"]);
    setMattingFeeAed(mattingDefault);
    setHeavyDogFeeAed(heavyDefault);
    dogSizeManualRef.current = false;
    setDogSize(null);
    setGroomerName("");
    setShowPreferredGroomerHint(false);
    lastPrefilledOwnerIdForGroomer.current = null;
    newApptPriceManualRef.current = false;
    setPrice("");
    setDiscountPct("");
    setPaymentMethod(null);
    setVisitNotes("");
    setOwnerId(null);
    setOwnerLabel(null);
    setSelectedPetIds([]);
    setLinkBoarding(false);
    setBookingSearch("");
    setBookingId(null);
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!editAppt) return;
    setEditSelectedServices(serviceCheckboxValuesFromAppointment(editAppt));
    setEditApptDate(parseISO(editAppt.appointment_date));
    const gd = parseGroomingMeta(editAppt.notes).groomingDate;
    setEditGroomingDate(gd ? parseISO(gd) : parseISO(editAppt.appointment_date));
    setEditApptTime(appointmentTimeToInputValue(editAppt.appointment_time));
    setEditDurationMin(editAppt.duration_minutes ?? 60);
    setEditGroomerName(editAppt.grooming_notes ?? "");
    setEditPrice(editAppt.price != null ? String(editAppt.price) : "");
    setEditVisitNotes(userVisitNotesFromStored(editAppt.notes));
  }, [editAppt]);

  const timeToDb = (t: string) => {
    const parts = t.split(":");
    const h = parts[0] ?? "10";
    const m = parts[1] ?? "00";
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
  };

  const togglePetSelected = (id: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSaveEdit = () => {
    if (!editAppt || updateAppt.isPending) return;
    if (editSelectedServices.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(editApptTime)) {
      toast.error("Enter a valid appointment time.");
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

    updateAppt.mutate(
      {
        id: editAppt.id,
        appointment_date: format(editApptDate, "yyyy-MM-dd"),
        appointment_time: timeToDb(editApptTime),
        duration_minutes: editDurationMin,
        service: primaryService,
        grooming_notes: editGroomerName.trim() || null,
        price: finalPrice,
        notes: composedNotes || null,
      },
      {
        onSuccess: () => {
          toast.success("Appointment updated.");
          setEditAppt(null);
          setActionAppt(null);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save changes."),
      },
    );
  };

  const handleCreate = async () => {
    if (createAppt.isPending) return;
    if (!ownerId) {
      toast.error("Select an owner.");
      return;
    }
    const petIdsToBook = pets
      .filter((p) => selectedPetIds.includes(p.id))
      .map((p) => p.id);
    if (petIdsToBook.length === 0) {
      toast.error(
        pets.length > 1
          ? "Select at least one pet."
          : "No pet available for this owner.",
      );
      return;
    }
    if (linkBoarding && !bookingId) {
      toast.error("Select a boarding booking to link, or turn off the link.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(apptTime)) {
      toast.error("Enter a valid appointment time.");
      return;
    }
    if (selectedServices.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    if (!dogSize) {
      toast.error("Select dog size so pricing can load from the rate card.");
      return;
    }

    const primaryCb = resolvePrimaryGroomingCheckbox(
      selectedServices.filter(isGroomingPricingCheckbox),
    );
    const primaryService = primaryCb ? groomingPricingCheckboxToDbService(primaryCb) : null;
    if (!primaryService) {
      toast.error("Could not resolve a valid service. Please reselect services.");
      return;
    }

    const priceNum = parseFloat(price);
    const serviceRate = newApptComputedOriginalAed ?? 0;
    const baseForCharge = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null;
    const fallbackBase =
      typeof serviceRate === "number" && serviceRate >= 0 ? serviceRate : null;
    const basePrice = baseForCharge ?? fallbackBase;
    const finalPrice = isComplimentaryPayment
      ? 0
      : basePrice != null
        ? Number((basePrice * (1 - normalizedDiscountPct / 100)).toFixed(2))
        : NaN;
    if (!isComplimentaryPayment && (Number.isNaN(finalPrice) || finalPrice < 0)) {
      toast.error("Price is not loaded yet. Wait a moment or enter it manually.");
      return;
    }

    const selectedServiceLabels = selectedServices
      .map((svc) => {
        const opt = GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.value === svc);
        if (!opt) return svc;
        if (svc === "matting_fee") {
          const raw = parseFloat(mattingFeeAed);
          const v = clampMattingFeeAed(
            Number.isFinite(raw) ? raw : (manualFeeBounds?.mattingMin ?? 0),
            manualFeeBounds,
          );
          return `${opt.label} (AED ${v})`;
        }
        if (svc === "heavy_dog_fee") {
          const raw = parseFloat(heavyDogFeeAed);
          const v = clampHeavyDogFeeAed(
            Number.isFinite(raw) ? raw : (manualFeeBounds?.heavyMin ?? 0),
            manualFeeBounds,
          );
          return `${opt.label} (AED ${v})`;
        }
        return opt.label;
      })
      .join(", ");
    const originalForNote =
      baseForCharge != null ? baseForCharge.toFixed(2) : String(serviceRate ?? "0");
    const metaNotes = [
      selectedServiceLabels ? `Services: ${selectedServiceLabels}` : null,
      `Grooming date: ${format(groomingDate, "yyyy-MM-dd")}`,
      `Estimated pickup: ${estPickupTimeLabel}`,
      normalizedDiscountPct > 0
        ? `Discount: ${normalizedDiscountPct}% (original AED ${originalForNote})`
        : null,
    ].filter(Boolean);
    const composedNotes = [visitNotes.trim(), ...metaNotes]
      .filter(Boolean)
      .join("\n");

    const insertBase = {
      appointment_date: format(apptDate, "yyyy-MM-dd"),
      appointment_time: timeToDb(apptTime),
      duration_minutes: durationMin,
      service: primaryService,
      owner_id: ownerId,
      groomer_id: null,
      grooming_notes: groomerName.trim() || null,
      price: finalPrice,
      notes: composedNotes || null,
      booking_id: linkBoarding ? bookingId : null,
      payment_method: paymentMethod ?? null,
      dog_size: dogSize,
    };

    try {
      const createdRows = [];
      const consumedCreditByPet: Record<string, { package_name: string }> = {};
      for (const pid of petIdsToBook) {
        const appt = await createAppt.mutateAsync({
          ...insertBase,
          pet_id: pid,
        });
        createdRows.push(appt);
        const credit = groomingCreditsByPet[pid];
        const useCredit = (useCreditByPet[pid] ?? false) && !!credit;
        if (useCredit && credit) {
          const { error } = await supabase.rpc("consume_service_credit", {
            p_credit_id: credit.credit_id,
            p_units: 1,
            p_consumed_for_ref_id: appt.id,
            p_consumed_for_ref_type: "grooming_appointment",
          });
          if (error) throw error;
          consumedCreditByPet[pid] = { package_name: credit.package_name ?? "package credit" };
        }
      }

      toast.success(
        createdRows.length === 1
          ? "Appointment created."
          : `${createdRows.length} appointments created.`,
      );
      setSheetOpen(false);

      const svcLabel = selectedServiceLabels || labelForGroomingService(primaryService);
      createServiceInvoice({
        ownerId: ownerId!,
        serviceType: "grooming",
        referenceId: createdRows[0].id,
        notes: paymentMethod
          ? `Payment method: ${groomingPaymentMethodLabel(paymentMethod)}`
          : undefined,
        lineItems: createdRows.map((appt) => {
          const petName =
            pets.find((p) => p.id === appt.pet_id)?.name ?? "Pet";
          const consumed = consumedCreditByPet[appt.pet_id];
          return {
            description: consumed
              ? `${svcLabel} — ${petName} — ${format(apptDate, "d MMM yyyy")} (covered by ${consumed.package_name})`
              : `${svcLabel} — ${petName} — ${format(apptDate, "d MMM yyyy")}`,
            quantity: 1,
            unitPrice: consumed ? 0 : finalPrice,
            serviceType: "grooming",
            preserveUnitPrice: true,
          };
        }),
      })
        .then(() => {
          toast.success("Draft invoice created");
        })
        .catch((err) => {
          console.error("Auto-invoice failed:", err);
        });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: string }).message)
            : "Could not create.";
      toast.error(msg);
    }
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
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

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

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            lastPrefilledOwnerIdForGroomer.current = null;
            setShowPreferredGroomerHint(false);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New appointment</SheetTitle>
            <SheetDescription>
              Book a grooming slot and optional boarding link.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Client &amp; pet
              </h3>
              <div className="space-y-2">
                <Label>Owner</Label>
                <OwnerClientSearch
                  selectedId={ownerId}
                  selectedLabel={ownerLabel}
                  onSelect={(id, label) => {
                    setOwnerId(id);
                    setOwnerLabel(label);
                    setSelectedPetIds([]);
                  }}
                  onClear={() => {
                    setOwnerId(null);
                    setOwnerLabel(null);
                    setSelectedPetIds([]);
                  }}
                />
                {ownerForGroomingPref && ownerForGroomingPref.id === ownerId ? null : null}
              </div>
              {ownerId && pets.length === 0 && (
                <p className="text-sm text-muted-foreground">Loading pets…</p>
              )}
              {pets.length > 1 && (
                <div className="space-y-2">
                  <Label>Pets</Label>
                  <p className="text-xs text-muted-foreground">
                    Select one or more pets for this appointment.
                  </p>
                  <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
                    {pets.map((p) => (
                      <label
                        key={p.id}
                        htmlFor={`groom-pet-${p.id}`}
                        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`groom-pet-${p.id}`}
                          checked={selectedPetIds.includes(p.id)}
                          onCheckedChange={() => togglePetSelected(p.id)}
                        />
                        <span className="text-sm font-medium flex-1 min-w-0">{p.name}</span>
                        {petHasSpecialAlerts(parsePetSpecialAlerts(p.special_alerts)) ? (
                          <Badge
                            variant="outline"
                            className="border-orange-400 bg-orange-50 text-orange-900 text-[10px] shrink-0"
                          >
                            Alert
                          </Badge>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {pets.length === 1 && (
                <div className="space-y-2">
                  <Label>Pet</Label>
                  <p className="text-sm font-medium">{pets[0].name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatLastGroomedDisplayLine(lastGroomMap.get(pets[0].id))}
                  </p>
                  <PetSpecialAlertsBanner specialAlerts={pets[0].special_alerts} />
                </div>
              )}
              {petsForSafetyScan.map((pet) => {
                const scan = petProfileTextForSafetyScan(pet);
                if (!petSafetyKeywordHit(scan)) return null;
                return (
                  <PetSafetyNotesBanner
                    key={`kw-safety-${pet.id}`}
                    petLabel={pets.length > 1 ? pet.name : undefined}
                    notesText={scan}
                  />
                );
              })}
              {selectedPetsOrdered.length > 0 && (
                <div className="space-y-3">
                  {selectedPetsOrdered.map((pet) => (
                    <Card key={pet.id} className="border bg-muted/10">
                      <CardContent className="space-y-1 p-3 text-sm pt-4">
                        <p className="font-semibold border-b pb-2 mb-2">{pet.name}</p>
                        {pets.length > 1 ? (
                          <p className="text-xs text-muted-foreground -mt-1 mb-2">
                            {formatLastGroomedDisplayLine(lastGroomMap.get(pet.id))}
                          </p>
                        ) : null}
                        {groomingCreditsByPet[pet.id] ? (
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-emerald-900">
                                Available: {groomingCreditsByPet[pet.id]?.units_remaining} credit(s), exp{" "}
                                {groomingCreditsByPet[pet.id]?.expires_at}
                              </p>
                              <label className="flex items-center gap-2 text-xs font-medium text-emerald-900">
                                <Switch
                                  checked={useCreditByPet[pet.id] ?? true}
                                  onCheckedChange={(checked) =>
                                    setUseCreditByPet((prev) => ({ ...prev, [pet.id]: checked }))
                                  }
                                />
                                Use credit
                              </label>
                            </div>
                            <p className="text-[11px] text-emerald-800">
                              When enabled, invoice line is recorded as covered by package credit.
                            </p>
                          </div>
                        ) : null}
                        <PetSpecialAlertsBanner specialAlerts={pet.special_alerts} />
                        <p>
                          <span className="text-muted-foreground">Breed: </span>
                          {pet.breed ?? "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Weight: </span>
                          {pet.weight_kg != null ? `${pet.weight_kg} kg` : "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Coat / colour: </span>
                          {pet.colour ?? "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Grooming notes: </span>
                          {pet.grooming_notes ?? "—"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Appointment details
              </h3>
              <div className="space-y-2">
                <Label>Service</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {GROOMING_SERVICE_CHECKBOX_OPTIONS.map((o) => {
                    const checked = selectedServices.includes(o.value);
                    const r =
                      o.value === "matting_fee" &&
                      manualFeeBounds &&
                      manualFeeBounds.mattingMax > manualFeeBounds.mattingMin
                        ? {
                            min: manualFeeBounds.mattingMin,
                            max: manualFeeBounds.mattingMax,
                            default: manualFeeBounds.mattingMin,
                          }
                        : o.value === "heavy_dog_fee" &&
                            manualFeeBounds &&
                            manualFeeBounds.heavyMax > manualFeeBounds.heavyMin
                          ? {
                              min: manualFeeBounds.heavyMin,
                              max: manualFeeBounds.heavyMax,
                              default: manualFeeBounds.heavyMin,
                            }
                          : undefined;
                    return (
                      <label
                        key={o.value}
                        className={cn(
                          "flex gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                          r ? "col-span-2 flex-col sm:flex-row sm:items-center" : "items-center",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const shouldCheck = e.target.checked;
                              if (shouldCheck && r) {
                                if (o.value === "matting_fee") {
                                  setMattingFeeAed(String(r.default));
                                }
                                if (o.value === "heavy_dog_fee") {
                                  setHeavyDogFeeAed(String(r.default));
                                }
                              }
                              setSelectedServices((prev) => {
                                if (shouldCheck) {
                                  if (prev.includes(o.value)) return prev;
                                  return [...prev, o.value];
                                }
                                return prev.filter((v) => v !== o.value);
                              });
                            }}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span>{o.label}</span>
                            {dogSize &&
                            ["full_groom", "deshedding", "bath_only", "full_bath_full"].includes(
                              o.value,
                            ) ? (
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {servicePriceHints[o.value] == null
                                  ? "Rate not configured"
                                  : `from AED ${servicePriceHints[o.value]!.toFixed(2)}`}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {r && checked ? (
                          <div className="flex shrink-0 items-center gap-1.5 pl-6 sm:pl-0">
                            <span className="text-xs text-muted-foreground">AED</span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={r.min}
                              max={r.max}
                              step={1}
                              className="h-8 w-[5.5rem] text-right text-sm"
                              value={o.value === "matting_fee" ? mattingFeeAed : heavyDogFeeAed}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (o.value === "matting_fee") setMattingFeeAed(next);
                                else setHeavyDogFeeAed(next);
                              }}
                            />
                          </div>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>

              <DogSizeField
                name="grooming-new-appt-dog-size"
                value={dogSize}
                onChange={(value) => {
                  dogSizeManualRef.current = true;
                  setDogSize(value);
                }}
              />
              {!dogSize ? (
                <p className="text-xs text-amber-700">
                  Select dog size (or choose a pet with size on file) to load live rates from Billing.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Appointment Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !apptDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(apptDate, "d MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={apptDate}
                        onSelect={(d) => d && setApptDate(d)}
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
                          !groomingDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(groomingDate, "d MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={groomingDate}
                        onSelect={(d) => d && setGroomingDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={apptTime}
                    onChange={(e) => setApptTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    min={15}
                    step={5}
                    value={durationMin}
                    onChange={(e) =>
                      setDurationMin(parseInt(e.target.value, 10) || 60)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Est. pickup time</Label>
                  <Input
                    readOnly
                    value={estPickupTimeLabel}
                    className="bg-muted/40 font-medium tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price (AED) - Original</Label>
                  <p className="text-xs text-muted-foreground">
                    Fills from service and dog size (add-ons included). You can still edit the amount.
                  </p>
                  {dogSize && !newApptPriceFetching && newApptComputedOriginalAed == null ? (
                    <p className="text-xs text-amber-700">
                      No matching rate in Billing for this service/size combination. Enter price manually or
                      update the Grooming (v2) grid.
                    </p>
                  ) : null}
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={price}
                    disabled={isComplimentaryPayment}
                    onChange={(e) => {
                      newApptPriceManualRef.current = true;
                      setPrice(e.target.value);
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
              <div
                className={cn(
                  "space-y-3 rounded-lg border p-3",
                  isComplimentaryPayment && "pointer-events-none opacity-50",
                )}
              >
                <Label>Discount</Label>
                <p className="text-xs text-muted-foreground">
                  Choose a preset or enter a custom percentage. Leave empty or 0 for no discount.
                </p>
                <div className="flex flex-wrap gap-2">
                  {DISCOUNT_QUICK_PCTS.map((pct) => {
                    const active =
                      discountPct.trim() !== "" &&
                      Number.parseFloat(discountPct) === pct;
                    return (
                      <Button
                        key={pct}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="min-w-[3.25rem]"
                        onClick={() => {
                          discountAutoFromMemberRef.current = false;
                          setDiscountPct(String(pct));
                        }}
                      >
                        {pct}%
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount-pct-manual">Custom discount (%)</Label>
                  <Input
                    id="discount-pct-manual"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="0"
                    value={discountPct}
                    onChange={(e) => {
                      discountAutoFromMemberRef.current = false;
                      setDiscountPct(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Final price (AED)</Label>
                  <Input
                    readOnly
                    className="font-medium tabular-nums"
                    value={
                      newApptFinalAed != null ? newApptFinalAed.toFixed(2) : "—"
                    }
                  />
                  {newApptSaveAed != null && newApptSaveAed > 0 ? (
                    <p className="text-sm font-medium text-emerald-700">
                      You save: {newApptSaveAed % 1 === 0 ? newApptSaveAed.toFixed(0) : newApptSaveAed.toFixed(2)} AED
                    </p>
                  ) : normalizedDiscountPct <= 0 && newApptOriginalAed != null ? (
                    <p className="text-xs text-muted-foreground">
                      Final price matches the original price above.
                    </p>
                  ) : null}
                  {newApptFinalAed != null ? (
                    <div className="space-y-1 pt-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{vatLineLabel()}</span>
                        <span className="tabular-nums font-medium">
                          {vatAmountFromGrossInclusive(newApptFinalAed).toFixed(2)} AED
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 font-bold">
                        <span>Total incl. VAT</span>
                        <span className="tabular-nums">
                          {Math.max(0, newApptFinalAed).toFixed(2)} AED
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment method (optional)</Label>
                <Select
                  value={paymentMethod ?? GROOMING_PAYMENT_METHOD_NONE}
                  onValueChange={(v) =>
                    setPaymentMethod(parseGroomingPaymentMethodSelectValue(v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GROOMING_PAYMENT_METHOD_NONE}>
                      Not specified
                    </SelectItem>
                    {GROOMING_PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Optional. When set, stored on the appointment and copied to the draft invoice.
                </p>
                {isComplimentaryPayment ? (
                  <p className="text-sm font-medium text-emerald-700">
                    This service is complimentary
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Groomer</Label>
                <Input
                  value={groomerName}
                  onChange={(e) => {
                    setGroomerName(e.target.value);
                    setShowPreferredGroomerHint(false);
                  }}
                  placeholder="Groomer name"
                />
                {showPreferredGroomerHint ? (
                  <p className="text-xs text-muted-foreground">
                    Preferred groomer from client profile
                  </p>
                ) : null}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h3>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  placeholder="What will be done / special instructions…"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label htmlFor="link-boarding" className="cursor-pointer">
                  Linked to boarding stay
                </Label>
                <Switch
                  id="link-boarding"
                  checked={linkBoarding}
                  onCheckedChange={(v) => {
                    setLinkBoarding(v);
                    if (!v) {
                      setBookingId(null);
                      setBookingSearch("");
                    }
                  }}
                />
              </div>
              {linkBoarding && (
                <div className="space-y-2">
                  <Label>Find booking (ref or owner)</Label>
                  <Input
                    value={bookingSearch}
                    onChange={(e) => {
                      setBookingSearch(e.target.value);
                      setBookingId(null);
                    }}
                    placeholder="Search booking ref or owner…"
                  />
                  {bookingSearch.trim().length >= 2 && (
                    <ul className="max-h-40 overflow-y-auto rounded-md border text-sm divide-y">
                      {bookingHits.map((b: BookingLinkRow) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            className={cn(
                              "w-full px-3 py-2 text-left hover:bg-muted/60",
                              bookingId === b.id && "bg-muted",
                            )}
                            onClick={() => setBookingId(b.id)}
                          >
                            <span className="font-mono text-xs">
                              {b.booking_ref ?? b.id.slice(0, 8)}
                            </span>
                            <span className="block text-muted-foreground text-xs">
                              {b.owners
                                ? ownerDisplayName(b.owners.first_name, b.owners.last_name)
                                : "—"}{" "}
                              · {format(parseISO(b.check_in_date), "d MMM")} –{" "}
                              {format(parseISO(b.check_out_date), "d MMM")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {bookingId && (
                    <p className="text-xs text-emerald-700">Booking linked.</p>
                  )}
                </div>
              )}
            </section>
          </div>

          <SheetFooter className="mt-8 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createAppt.isPending}
            >
              {createAppt.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save appointment
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default GroomingPage;
