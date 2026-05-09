import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays,
  format,
  parse,
  parseISO,
  subDays,
} from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { ownerDisplayName, createServiceInvoice } from "@/lib/bookingUtils";
import { useOwners } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GROOMING_PRICING_FALLBACK_KEYS,
  GROOMING_SERVICE_TO_PRICING_KEY,
  groomingServiceToPricingKey,
} from "@/lib/addonPricing";
import {
  useGroomingAppointments,
  useGroomingGlobalSearch,
  useCreateGroomingAppointment,
  useUpdateGroomingAppointment,
  useMarkInProgress,
  useMarkComplete,
  useMarkNoShow,
  useBookingsForGroomingLink,
  type GroomingAppointmentWithJoins,
  type BookingLinkRow,
} from "@/hooks/useGrooming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus,
  Printer,
  Search,
  X,
  CalendarIcon,
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
  | "fur_brushing"
  | "teeth_brushing"
  | "nail_clip"
  | "blow_dry"
  | "ear_cleaning"
  | "pawdicure"
  | "paw_wash"
  | "malaseb_bath";

const GROOMING_SERVICE_CHECKBOX_OPTIONS: Array<{
  value: GroomingServiceCheckbox;
  label: string;
  mapsTo: GroomingService;
}> = [
  { value: "full_groom", label: "Full groom", mapsTo: "full_groom" },
  { value: "deshedding", label: "Deshedding", mapsTo: "deshedding" },
  { value: "bath_only", label: "Bath only", mapsTo: "full_bath" },
  { value: "fur_brushing", label: "Fur brushing", mapsTo: "brushing" },
  { value: "teeth_brushing", label: "Teeth brushing", mapsTo: "brushing" },
  { value: "nail_clip", label: "Nail clip", mapsTo: "nail_clip" },
  { value: "blow_dry", label: "Blow dry", mapsTo: "full_bath" },
  { value: "ear_cleaning", label: "Ear cleaning", mapsTo: "brushing" },
  { value: "pawdicure", label: "Pawdicure", mapsTo: "pawdicure" },
  { value: "paw_wash", label: "Paw wash", mapsTo: "pawdicure" },
  { value: "malaseb_bath", label: "Malaseb bath", mapsTo: "full_bath" },
];

function parseGroomingMeta(
  notes: string | null | undefined,
): { services: string[]; groomingDate: string | null } {
  if (!notes) return { services: [], groomingDate: null };
  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const servicesLine = lines.find((l) => l.toLowerCase().startsWith("services:"));
  const groomingDateLine = lines.find((l) =>
    l.toLowerCase().startsWith("grooming date:"),
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
  return { services, groomingDate };
}

function appointmentServiceLabels(a: GroomingAppointmentWithJoins): string[] {
  const primary = serviceLabel(a.service);
  const extra = parseGroomingMeta(a.notes).services;
  return Array.from(new Set([primary, ...extra]));
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

function VisitNotesField({ a }: { a: GroomingAppointmentWithJoins }) {
  const update = useUpdateGroomingAppointment();
  const [val, setVal] = useState(a.notes ?? "");

  useEffect(() => {
    setVal(a.notes ?? "");
  }, [a.id, a.notes]);

  const save = () => {
    const next = val.trim() || null;
    const prev = a.notes ?? null;
    if (next === prev) return;
    update.mutate(
      { id: a.id, notes: next },
      {
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save notes."),
      },
    );
  };

  return (
    <Textarea
      className="min-h-[72px] text-sm resize-y"
      placeholder="Visit notes…"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      disabled={update.isPending}
    />
  );
}

function GroomingOwnerSearch({
  onSelect,
  selectedOwnerId,
  selectedLabel,
  onClear,
}: {
  onSelect: (id: string, label: string) => void;
  selectedOwnerId: string | null;
  selectedLabel: string | null;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: owners, isLoading } = useOwners(
    query.length >= 1 ? query : undefined,
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedLabel && selectedOwnerId) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium truncate">{selectedLabel}</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full p-0.5 hover:bg-muted shrink-0"
          aria-label="Clear owner"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        className="pl-9"
        placeholder="Search client or pet name / phone…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-2 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !owners?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No clients or pets found</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y">
              {owners.map((o) => {
                const label = ownerDisplayName(o.first_name, o.last_name);
                const petNames = (o.pets ?? []).map((p) => p.name).filter(Boolean).join(", ");
                const details = [petNames, o.phone].filter(Boolean).join(" · ");
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(o.id, label);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {details}
                      </span>
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

function AppointmentCard({
  a,
  onPrint,
}: {
  a: GroomingAppointmentWithJoins;
  onPrint: (appointmentId: string) => void;
}) {
  const markStart = useMarkInProgress();
  const markDone = useMarkComplete();
  const markNs = useMarkNoShow();

  const status = a.status;
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
    <Card>
      <CardContent className="p-0">
        <div className="grid gap-4 p-4 lg:grid-cols-[10rem_1fr_14rem] lg:items-start">
          <div className="space-y-2">
            <p className="text-2xl font-semibold tabular-nums">
              {formatApptTime(a.appointment_time)}
            </p>
            <Badge variant="outline" className="font-normal">
              {duration} min
            </Badge>
          </div>

          <div className="space-y-2 min-w-0">
            <p className="text-xl font-bold truncate">{petName}</p>
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

            <div className="flex flex-col gap-2 lg:items-end">
              <Button
                size="sm"
                variant="outline"
                className="w-full lg:w-auto"
                onClick={() => onPrint(a.id)}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print card
              </Button>
              {status === "scheduled" && (
                <Button
                  size="sm"
                  className="w-full lg:w-auto"
                  disabled={markStart.isPending}
                  onClick={() =>
                    markStart.mutate(a.id, {
                      onError: (e) =>
                        toast.error(
                          e instanceof Error ? e.message : "Could not start.",
                        ),
                    })
                  }
                >
                  {markStart.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Start
                </Button>
              )}
              {status === "in_progress" && (
                <>
                  <Button
                    size="sm"
                    className="w-full lg:w-auto bg-emerald-600 hover:bg-emerald-700"
                    disabled={markDone.isPending}
                    onClick={() =>
                      markDone.mutate(a.id, {
                        onError: (e) =>
                          toast.error(
                            e instanceof Error ? e.message : "Could not complete.",
                          ),
                      })
                    }
                  >
                    {markDone.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full lg:w-auto text-muted-foreground"
                    disabled={markNs.isPending}
                    onClick={() =>
                      markNs.mutate(a.id, {
                        onError: (e) =>
                          toast.error(
                            e instanceof Error ? e.message : "Could not update.",
                          ),
                      })
                    }
                  >
                    No Show
                  </Button>
                </>
              )}
              {status === "completed" && (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 w-fit lg:ml-auto">
                  Completed
                  {a.completed_at
                    ? ` · ${format(parseISO(a.completed_at), "h:mm a")}`
                    : ""}
                </Badge>
              )}
              {status === "cancelled" && (
                <Badge variant="secondary" className="w-fit lg:ml-auto">
                  {a.no_show ? "No show" : "Cancelled"}
                </Badge>
              )}
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

  useEffect(() => {
    const d = searchParams.get("date");
    if (!d) return;
    if (d === "today") {
      setDay(new Date());
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDay(parseISO(d));
    }
  }, [searchParams]);

  const dateStr = format(day, "yyyy-MM-dd");

  const { data: dayAppointments = [], isLoading: dayLoading } =
    useGroomingAppointments(dateStr);
  const [historySearch, setHistorySearch] = useState("");
  const { data: searchResults = [], isFetching: searchFetching } =
    useGroomingGlobalSearch(historySearch);

  const createAppt = useCreateGroomingAppointment();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<GroomingServiceCheckbox[]>([
    "full_groom",
  ]);
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [groomingDate, setGroomingDate] = useState<Date>(new Date());
  const [apptTime, setApptTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(60);
  const [groomerName, setGroomerName] = useState("");
  const [price, setPrice] = useState("");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPct, setDiscountPct] = useState("0");
  const [visitNotes, setVisitNotes] = useState("");
  const [linkBoarding, setLinkBoarding] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [serviceSearch, setServiceSearch] = useState("");

  const { data: pets = [] } = usePets(ownerId ?? "");
  const { data: bookingHits = [] } = useBookingsForGroomingLink(
    linkBoarding ? bookingSearch : "",
  );

  const { data: groomingRates = [] } = useQuery({
    queryKey: ["grooming_service_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_service_rates")
        .select("service, label, price_aed, duration_minutes")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: groomingPriceCard = [] } = useQuery({
    queryKey: ["pricing", "grooming_rate_card"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing")
        .select("key, amount_aed")
        .in("key", GROOMING_PRICING_FALLBACK_KEYS);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rateMap = useMemo(() => {
    const priceByPk = new Map(groomingPriceCard.map((r) => [r.key, r.amount_aed]));
    const m: Record<string, { price_aed: number; duration_minutes: number | null }> = {};
    for (const r of groomingRates) {
      m[r.service] = { price_aed: r.price_aed, duration_minutes: r.duration_minutes };
    }
    for (const svc of Object.keys(GROOMING_SERVICE_TO_PRICING_KEY)) {
      const pk = groomingServiceToPricingKey(svc);
      const fallback = pk ? priceByPk.get(pk) : undefined;
      const cur = m[svc];
      if (typeof fallback === "number") {
        m[svc] = {
          price_aed: fallback,
          duration_minutes: cur?.duration_minutes ?? null,
        };
      }
    }
    return m;
  }, [groomingRates, groomingPriceCard]);

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

  /** Single-pet owners: keep the only pet selected automatically (same UX as before). */
  useEffect(() => {
    if (!sheetOpen || !ownerId) return;
    if (pets.length === 1) {
      setSelectedPetIds([pets[0].id]);
    }
  }, [sheetOpen, ownerId, petsIdFingerprint, pets.length]);

  const mappedServices = useMemo(
    () =>
      selectedServices.map(
        (svc) =>
          GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.value === svc)?.mapsTo ??
          "full_groom",
      ),
    [selectedServices],
  );
  const defaultOriginalPrice = useMemo(
    () =>
      mappedServices.reduce(
        (sum, svc) =>
          sum + (typeof rateMap[svc]?.price_aed === "number" ? rateMap[svc].price_aed : 0),
        0,
      ),
    [mappedServices, rateMap],
  );
  const normalizedDiscountPct = useMemo(() => {
    const parsed = Number.parseFloat(discountPct);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
  }, [discountPct]);

  const openNewSheet = () => {
    setApptDate(day);
    setGroomingDate(day);
    setApptTime("10:00");
    setDurationMin(60);
    setSelectedServices(["full_groom"]);
    setGroomerName("");
    setPrice("");
    setDiscountEnabled(false);
    setDiscountPct("0");
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
    if (!sheetOpen) return;
    setPrice(String(defaultOriginalPrice));
  }, [defaultOriginalPrice, sheetOpen]);

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

    const primaryService = mappedServices[0];
    if (!primaryService) {
      toast.error("Could not resolve a valid service. Please reselect services.");
      return;
    }

    const priceNum = parseFloat(price);
    const serviceRate = defaultOriginalPrice;
    const discountedPrice = discountEnabled
      ? priceNum * (1 - normalizedDiscountPct / 100)
      : priceNum;
    const finalPrice =
      Number.isFinite(discountedPrice) && discountedPrice >= 0
        ? Number(discountedPrice.toFixed(2))
        : typeof serviceRate === "number" && serviceRate >= 0
          ? Number(serviceRate.toFixed(2))
          : NaN;
    if (Number.isNaN(finalPrice) || finalPrice < 0) {
      toast.error("Price is not loaded yet. Wait a moment or enter it manually.");
      return;
    }
    if (String(finalPrice) !== price) {
      setPrice(String(finalPrice));
    }

    // #region agent log
    fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H3',location:'src/pages/Grooming.tsx:handleCreate:beforeMutate',message:'grooming create submitted',data:{primaryService,selectedServices,hasOwnerId:!!ownerId,petCount:petIdsToBook.length,appointmentDate:format(apptDate,'yyyy-MM-dd'),groomingDate:format(groomingDate,'yyyy-MM-dd'),appointmentTime:apptTime,durationMin,linkBoarding,hasBookingId:!!bookingId,enteredPrice:price||null,discountEnabled,discountPct:normalizedDiscountPct,finalPrice},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const selectedServiceLabels = selectedServices
      .map((svc) =>
        GROOMING_SERVICE_CHECKBOX_OPTIONS.find((o) => o.value === svc)?.label ?? svc,
      )
      .join(", ");
    const metaNotes = [
      selectedServiceLabels ? `Services: ${selectedServiceLabels}` : null,
      `Grooming date: ${format(groomingDate, "yyyy-MM-dd")}`,
      discountEnabled
        ? `Discount: ${normalizedDiscountPct}% (original AED ${price || "0"})`
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
    };

    try {
      const createdRows = [];
      for (const pid of petIdsToBook) {
        const appt = await createAppt.mutateAsync({
          ...insertBase,
          pet_id: pid,
        });
        createdRows.push(appt);
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
        lineItems: createdRows.map((appt) => {
          const petName =
            pets.find((p) => p.id === appt.pet_id)?.name ?? "Pet";
          return {
            description: `${svcLabel} — ${petName} — ${format(apptDate, "d MMM yyyy")}`,
            quantity: 1,
            unitPrice: finalPrice,
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
      // #region agent log
      fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H3',location:'src/pages/Grooming.tsx:handleCreate:onError',message:'grooming create failed',data:{primaryService,selectedServices,appointmentDate:format(apptDate,'yyyy-MM-dd'),appointmentTime:apptTime,error:msg},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      toast.error(msg);
    }
  };

  const sortedHistory = useMemo(() => {
    return [...searchResults].sort((a, b) => {
      const d =
        b.appointment_date.localeCompare(a.appointment_date) ||
        (b.appointment_time ?? "").localeCompare(a.appointment_time ?? "");
      return d;
    });
  }, [searchResults]);
  const serviceMatches = (
    a: GroomingAppointmentWithJoins,
    exactFilter: string,
    textFilter: string,
  ) => {
    const labels = appointmentServiceLabels(a);
    const byChip =
      exactFilter === "all" ||
      labels.some((label) => label.toLowerCase() === exactFilter.toLowerCase());
    const q = textFilter.trim().toLowerCase();
    const byText = !q || labels.some((label) => label.toLowerCase().includes(q));
    return byChip && byText;
  };
  const filteredDayAppointments = useMemo(
    () =>
      dayAppointments.filter((a) =>
        serviceMatches(a, serviceFilter, serviceSearch),
      ),
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

        <Tabs defaultValue="day" className="space-y-4">
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
                Search by pet or owner
              </Label>
              <Input
                className="mt-1"
                placeholder="Type at least 2 characters…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            {historySearch.trim().length > 0 && historySearch.trim().length < 2 && (
              <p className="text-sm text-muted-foreground">
                Enter at least 2 characters to search.
              </p>
            )}
            {historySearch.trim().length >= 2 && searchFetching && (
              <Skeleton className="h-40 w-full" />
            )}
            {historySearch.trim().length >= 2 && !searchFetching && (
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No matches for this search/filter combination.
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
                          <TableCell className="capitalize">
                            {r.status.replace("_", " ")}
                            {r.no_show ? " (no show)" : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.price != null ? `AED ${r.price}` : "—"}
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
                <GroomingOwnerSearch
                  selectedOwnerId={ownerId}
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
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`groom-pet-${p.id}`}
                          checked={selectedPetIds.includes(p.id)}
                          onCheckedChange={() => togglePetSelected(p.id)}
                        />
                        <span className="text-sm font-medium">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {pets.length === 1 && (
                <div className="space-y-2">
                  <Label>Pet</Label>
                  <p className="text-sm font-medium">{pets[0].name}</p>
                </div>
              )}
              {selectedPetsOrdered.length > 0 && (
                <div className="space-y-3">
                  {selectedPetsOrdered.map((pet) => (
                    <Card key={pet.id} className="border bg-muted/10">
                      <CardContent className="space-y-1 p-3 text-sm pt-4">
                        <p className="font-semibold border-b pb-2 mb-2">{pet.name}</p>
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
                            setSelectedServices((prev) => {
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
              <div className="grid grid-cols-2 gap-3">
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
                  <Label>Price (AED) - Original</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-discount" className="cursor-pointer">
                    Apply discount
                  </Label>
                  <Switch
                    id="enable-discount"
                    checked={discountEnabled}
                    onCheckedChange={setDiscountEnabled}
                  />
                </div>
                {discountEnabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Discount (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Final Price (AED)</Label>
                      <Input
                        readOnly
                        value={
                          Number.isFinite(Number.parseFloat(price))
                            ? (Number.parseFloat(price) * (1 - normalizedDiscountPct / 100)).toFixed(2)
                            : "0.00"
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Final price matches the original editable price.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Groomer</Label>
                <Input
                  value={groomerName}
                  onChange={(e) => setGroomerName(e.target.value)}
                  placeholder="Groomer name"
                />
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
