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
import { useOwner, useOwners } from "@/hooks/useOwners";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  X,
  CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import { cn } from "@/lib/utils";
import {
  GROOMING_SERVICE_OPTIONS,
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

type GroomingPackageV2 =
  | "grande"
  | "bijoux"
  | "deshedding_long"
  | "deshedding_smooth"
  | "bath_blow";

const GROOMING_PACKAGE_BY_SERVICE: Partial<Record<GroomingService, GroomingPackageV2>> = {
  full_groom: "grande",
  full_bath: "bath_blow",
  deshedding: "deshedding_smooth",
};

function serviceLabel(s: GroomingService): string {
  return labelForGroomingService(s);
}

function normalizePetSizeCategory(
  raw: unknown,
): "S" | "M" | "L" | "XL" {
  if (typeof raw !== "string") return "M";
  const up = raw.toUpperCase();
  if (up === "S" || up === "M" || up === "L" || up === "XL") return up;
  return "M";
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
}: {
  a: GroomingAppointmentWithJoins;
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
                {serviceLabel(a.service)}
              </Badge>
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

            <div className="flex flex-col gap-2 lg:items-end">
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
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
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
  const [petId, setPetId] = useState<string>("");
  const [service, setService] = useState<GroomingService>("full_groom");
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [apptTime, setApptTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(60);
  const [groomerName, setGroomerName] = useState("");
  const [price, setPrice] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [linkBoarding, setLinkBoarding] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);

  const { data: pets = [] } = usePets(ownerId ?? "");
  const { data: selectedOwner } = useOwner(ownerId ?? "");
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

  const selectedPet = useMemo(
    () => pets.find((p) => p.id === petId),
    [pets, petId],
  );

  useEffect(() => {
    let cancelled = false;
    const loadPrice = async () => {
      const rate = rateMap[service];
      if (rate && !cancelled) {
        setPrice(String(rate.price_aed));
        if (rate.duration_minutes) setDurationMin(rate.duration_minutes);
      }

      const pkg = GROOMING_PACKAGE_BY_SERVICE[service];
      if (!pkg) return;

      const ownerTier = (selectedOwner?.member_type ?? "standard") as string;
      const petSize = normalizePetSizeCategory((selectedPet as any)?.size_category);
      try {
        const { data, error } = await supabase.rpc("resolve_grooming_price", {
          p_package: pkg,
          p_size: petSize,
          p_quantity: 1,
          p_tier: ownerTier,
        });
        if (error) throw error;
        const row = (data as { unit_price: number }[] | null)?.[0];
        if (!cancelled && row && typeof row.unit_price === "number") {
          setPrice(String(row.unit_price));
        }
      } catch {
        // Keep legacy fallback when resolver or size mapping is unavailable.
      }
    };

    loadPrice();
    return () => {
      cancelled = true;
    };
  }, [service, rateMap, selectedOwner?.member_type, selectedPet]);

  const openNewSheet = () => {
    setApptDate(day);
    setApptTime("10:00");
    setDurationMin(60);
    setService("full_groom");
    setGroomerName("");
    setPrice("");
    setVisitNotes("");
    setOwnerId(null);
    setOwnerLabel(null);
    setPetId("");
    setLinkBoarding(false);
    setBookingSearch("");
    setBookingId(null);
    setSheetOpen(true);
  };

  const timeToDb = (t: string) => {
    const parts = t.split(":");
    const h = parts[0] ?? "10";
    const m = parts[1] ?? "00";
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
  };

  const handleCreate = () => {
    if (createAppt.isPending) return;
    if (!ownerId || !petId) {
      toast.error("Select an owner and a pet.");
      return;
    }
    if (!pets.some((p) => p.id === petId)) {
      toast.error("Selected pet is no longer available for this owner. Please reselect.");
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

    const priceNum = parseFloat(price);
    const serviceRate = rateMap[service]?.price_aed;
    const finalPrice =
      Number.isFinite(priceNum) && priceNum >= 0
        ? priceNum
        : typeof serviceRate === "number" && serviceRate >= 0
          ? serviceRate
          : NaN;
    if (Number.isNaN(finalPrice) || finalPrice < 0) {
      toast.error("Price is not loaded yet. Wait a moment or enter it manually.");
      return;
    }
    if (String(finalPrice) !== price) {
      setPrice(String(finalPrice));
    }

    // #region agent log
    fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H3',location:'src/pages/Grooming.tsx:handleCreate:beforeMutate',message:'grooming create submitted',data:{service,hasOwnerId:!!ownerId,hasPetId:!!petId,appointmentDate:format(apptDate,'yyyy-MM-dd'),appointmentTime:apptTime,durationMin,linkBoarding,hasBookingId:!!bookingId,enteredPrice:price||null,finalPrice},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    createAppt.mutate(
      {
        appointment_date: format(apptDate, "yyyy-MM-dd"),
        appointment_time: timeToDb(apptTime),
        duration_minutes: durationMin,
        service,
        owner_id: ownerId,
        pet_id: petId,
        groomer_id: null,
        grooming_notes: groomerName.trim() || null,
        price: finalPrice,
        notes: visitNotes.trim() || null,
        booking_id: linkBoarding ? bookingId : null,
      },
      {
        onSuccess: (appt) => {
          toast.success("Appointment created.");
          setSheetOpen(false);

          const svcLabel = labelForGroomingService(service);
          createServiceInvoice({
            ownerId: ownerId!,
            serviceType: "grooming",
            referenceId: appt.id,
            lineItems: [{
              description: `${svcLabel} — ${format(apptDate, "d MMM yyyy")}`,
              quantity: 1,
              unitPrice: finalPrice,
              pricingKey: `grooming:${service}`,
              serviceType: "grooming",
            }],
          }).then(() => {
            toast.success("Draft invoice created");
          }).catch((err) => {
            console.error("Auto-invoice failed:", err);
          });
        },
        onError: (e) => {
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === "object" && e !== null && "message" in e
                ? String((e as { message: string }).message)
                : "Could not create.";
          // #region agent log
          fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H3',location:'src/pages/Grooming.tsx:handleCreate:onError',message:'grooming create failed',data:{service,appointmentDate:format(apptDate,'yyyy-MM-dd'),appointmentTime:apptTime,error:msg},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          toast.error(msg);
        },
      },
    );
  };

  const sortedHistory = useMemo(() => {
    return [...searchResults].sort((a, b) => {
      const d =
        b.appointment_date.localeCompare(a.appointment_date) ||
        (b.appointment_time ?? "").localeCompare(a.appointment_time ?? "");
      return d;
    });
  }, [searchResults]);

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
        </div>

        <Tabs defaultValue="day" className="space-y-4">
          <TabsList>
            <TabsTrigger value="day">Day View</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="day" className="space-y-4">
            {dayLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : dayAppointments.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">
                No grooming appointments for {format(day, "EEEE, d MMMM yyyy")}.
              </p>
            ) : (
              <div className="space-y-3">
                {dayAppointments.map((a) => (
                  <AppointmentCard key={a.id} a={a} />
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
                    {sortedHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No matches.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedHistory.map((r) => (
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
                          <TableCell>{serviceLabel(r.service)}</TableCell>
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
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
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
                    setPetId("");
                  }}
                  onClear={() => {
                    setOwnerId(null);
                    setOwnerLabel(null);
                    setPetId("");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Pet</Label>
                <Select
                  value={petId}
                  onValueChange={setPetId}
                  disabled={!ownerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pet" />
                  </SelectTrigger>
                  <SelectContent>
                    {pets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPet && (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Breed: </span>
                    {selectedPet.breed ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Weight: </span>
                    {selectedPet.weight_kg != null
                      ? `${selectedPet.weight_kg} kg`
                      : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Coat / colour: </span>
                    {selectedPet.colour ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Grooming notes: </span>
                    {selectedPet.grooming_notes ?? "—"}
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Appointment details
              </h3>
              <div className="space-y-2">
                <Label>Service</Label>
                <Select
                  value={service}
                  onValueChange={(v) => setService(v as GroomingService)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROOMING_SERVICE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
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
                  <Label>Price (AED)</Label>
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
                <Label>Visit notes</Label>
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
