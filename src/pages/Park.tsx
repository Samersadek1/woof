import { useState, useEffect, useRef, useMemo, Fragment } from "react";
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
  useParkBookings,
  useParkDayFlag,
  useCreateParkBooking,
  useDeleteParkBooking,
  useSetParkDayFlag,
  type ParkBookingWithJoins,
} from "@/hooks/usePark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ParkDayStatus = Database["public"]["Enums"]["park_day_status"];

const ANCHOR = new Date(2000, 0, 1);

/** 10 hourly slots: 08:00–09:00 … 17:00–18:00 */
const PARK_SLOTS: { slot_start: string; slot_end: string }[] = Array.from(
  { length: 10 },
  (_, i) => {
    const h = 8 + i;
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      slot_start: `${pad(h)}:00:00`,
      slot_end: `${pad(h + 1)}:00:00`,
    };
  },
);

function normalizeSlotTime(t: string): string {
  const m = t.match(/^(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : t.slice(0, 8);
}

function slotDisplayLabel(slot_start: string, slot_end: string): string {
  const s = parse(slot_start.slice(0, 8), "HH:mm:ss", ANCHOR);
  const e = parse(slot_end.slice(0, 8), "HH:mm:ss", ANCHOR);
  return `${format(s, "h:mm")} – ${format(e, "h:mm a")}`;
}

function ownerLabel(o: { first_name: string; last_name: string }): string {
  return ownerDisplayName(o.first_name, o.last_name);
}

function bookingsForSlot(
  bookings: ParkBookingWithJoins[],
  slotStart: string,
): ParkBookingWithJoins[] {
  const key = normalizeSlotTime(slotStart);
  return bookings.filter((b) => normalizeSlotTime(b.slot_start) === key);
}

function primaryBooking(
  list: ParkBookingWithJoins[],
): ParkBookingWithJoins | undefined {
  return list[0];
}

function bookingDisplayLine(b: ParkBookingWithJoins): string {
  const pet =
    b.pets?.name?.toUpperCase() ?? b.pet_name_raw?.toUpperCase() ?? "PET";
  const own =
    b.owners
      ? ownerDisplayName(b.owners.first_name, b.owners.last_name).toUpperCase()
      : b.owner_name_raw?.toUpperCase() ?? "OWNER";
  return `${pet} – ${own}`;
}

// ── Owner search (typeahead) ─────────────────────────────────────────────────

function ParkOwnerSearch({
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

// ── Page ─────────────────────────────────────────────────────────────────────

const ParkPage = () => {
  const [searchParams] = useSearchParams();
  const [day, setDay] = useState(() => new Date());

  useEffect(() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDay(parseISO(d));
    }
  }, [searchParams]);

  const dateStr = format(day, "yyyy-MM-dd");

  const { data: bookings = [], isLoading: bookingsLoading } =
    useParkBookings(dateStr);
  const { data: dayFlag, isLoading: flagLoading } = useParkDayFlag(dateStr);

  const createBooking = useCreateParkBooking();
  const deleteBooking = useDeleteParkBooking();
  const setDayFlag = useSetParkDayFlag();

  const { data: parkSlotFromPricing } = useQuery({
    queryKey: ["pricing", "park_slot"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pricing").select("amount_aed").eq("key", "park_slot").maybeSingle();
      if (error) throw error;
      return data?.amount_aed ?? null;
    },
  });
  const { data: parkRates = [] } = useQuery({
    queryKey: ["park_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("park_rates")
        .select("price_per_slot_aed")
        .eq("is_active", true)
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const slotPrice =
    typeof parkSlotFromPricing === "number" && parkSlotFromPricing > 0
      ? parkSlotFromPricing
      : (parkRates[0]?.price_per_slot_aed ?? 0);

  const effectiveStatus: ParkDayStatus = dayFlag?.status ?? "open";

  const [flagStatus, setFlagStatus] = useState<ParkDayStatus>("open");
  const [flagNotes, setFlagNotes] = useState("");

  useEffect(() => {
    if (dayFlag) {
      setFlagStatus(dayFlag.status);
      setFlagNotes(dayFlag.notes ?? "");
    } else {
      setFlagStatus("open");
      setFlagNotes("");
    }
  }, [dayFlag?.id, dayFlag?.status, dayFlag?.notes, dateStr]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSlot, setSheetSlot] = useState<{
    slot_start: string;
    slot_end: string;
  } | null>(null);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  const [isAssessment, setIsAssessment] = useState(false);
  const [bookingNotes, setBookingNotes] = useState("");

  const { data: pets = [] } = usePets(ownerId ?? "");

  const [popoverBooking, setPopoverBooking] = useState<ParkBookingWithJoins | null>(
    null,
  );

  const openNewBooking = (slot_start: string, slot_end: string) => {
    if (effectiveStatus === "closed") {
      toast.message("Park is closed — no bookings today.");
      return;
    }
    setSheetSlot({ slot_start, slot_end });
    setOwnerId(null);
    setOwnerLabel(null);
    setSelectedPetIds(new Set());
    setIsAssessment(effectiveStatus === "assessment_only");
    setBookingNotes("");
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSheetSlot(null);
  };

  const togglePet = (petId: string) => {
    setSelectedPetIds((prev) => {
      const next = new Set(prev);
      if (next.has(petId)) next.delete(petId);
      else next.add(petId);
      return next;
    });
  };

  const handleSaveBookings = async () => {
    if (!sheetSlot || !ownerId) {
      toast.error("Select an owner.");
      return;
    }
    if (selectedPetIds.size === 0) {
      toast.error("Select at least one pet.");
      return;
    }

    try {
      const createdIds: string[] = [];
      for (const petId of selectedPetIds) {
        const booking = await createBooking.mutateAsync({
          visit_date: dateStr,
          slot_start: sheetSlot.slot_start,
          slot_end: sheetSlot.slot_end,
          size_lane: "big",
          owner_id: ownerId,
          pet_id: petId,
          is_assessment: isAssessment,
          notes: bookingNotes.trim() || null,
          price: slotPrice,
        });
        createdIds.push(booking.id);
      }
      toast.success(
        selectedPetIds.size === 1
          ? "Booking saved."
          : `${selectedPetIds.size} bookings saved.`,
      );
      closeSheet();

      if (slotPrice > 0 && ownerId) {
        for (const id of createdIds) {
          createServiceInvoice({
            ownerId,
            serviceType: "park",
            referenceId: id,
            lineItems: [{
              description: `Park slot — ${format(parseISO(dateStr), "d MMM yyyy")} ${sheetSlot.slot_start}–${sheetSlot.slot_end}`,
              quantity: 1,
              unitPrice: slotPrice,
              pricingKey: "park:standard_slot",
              serviceType: "park",
            }],
          }).catch((err) => console.error("Park auto-invoice failed:", err));
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save booking.";
      toast.error(msg);
    }
  };

  const handleSaveDayFlag = () => {
    setDayFlag.mutate(
      {
        visit_date: dateStr,
        status: flagStatus,
        notes: flagNotes.trim() || null,
      },
      {
        onSuccess: () => toast.success("Day settings saved."),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not save settings."),
      },
    );
  };

  const handleDeleteBooking = (b: ParkBookingWithJoins) => {
    deleteBooking.mutate(
      { id: b.id, visit_date: b.visit_date, owner_id: b.owner_id },
      {
        onSuccess: () => {
          toast.success("Booking cancelled.");
          setPopoverBooking(null);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not cancel."),
      },
    );
  };

  const slotLabelReadOnly = sheetSlot
    ? slotDisplayLabel(sheetSlot.slot_start, sheetSlot.slot_end)
    : "";
  const bookingsBySlot = useMemo(() => {
    const map = new Map<string, ParkBookingWithJoins[]>();
    for (const slot of PARK_SLOTS) {
      const key = normalizeSlotTime(slot.slot_start);
      map.set(key, bookingsForSlot(bookings, slot.slot_start));
    }
    return map;
  }, [bookings]);

  return (
    <>
      <TopBar title="Park Visitation" />
      <main className="flex-1 overflow-auto p-8 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
            <h2 className="text-xl font-semibold min-w-[14rem]">
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

          <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            <div className="space-y-1 min-w-[10rem]">
              <Label className="text-xs text-muted-foreground">Day status</Label>
              <Select
                value={flagStatus}
                onValueChange={(v) => setFlagStatus(v as ParkDayStatus)}
                disabled={flagLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="assessment_only">Assessment Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[8rem] max-w-xs">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input
                value={flagNotes}
                onChange={(e) => setFlagNotes(e.target.value)}
                placeholder="Optional…"
              />
            </div>
            <Button
              type="button"
              onClick={handleSaveDayFlag}
              disabled={setDayFlag.isPending}
            >
              {setDayFlag.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </div>

        {effectiveStatus === "closed" && (
          <div
            className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-red-800"
            role="status"
          >
            CLOSED — No bookings today
          </div>
        )}
        {effectiveStatus === "assessment_only" && (
          <div
            className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-amber-900"
            role="status"
          >
            ASSESSMENT ONLY
          </div>
        )}

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-px bg-border text-sm font-medium">
            <div className="bg-muted/50 px-3 py-2">Time</div>
            <div className="bg-muted/50 px-3 py-2 text-center">Park</div>

            {PARK_SLOTS.map((slot) => {
              const key = normalizeSlotTime(slot.slot_start);
              const cellBookings = bookingsBySlot.get(key) ?? [];
              const primary = primaryBooking(cellBookings);
              const isBooked = !!primary;

              return (
                <Fragment key={slot.slot_start}>
                  <div className="bg-background px-3 py-3 text-muted-foreground text-xs sm:text-sm">
                    {slotDisplayLabel(slot.slot_start, slot.slot_end)}
                  </div>

                  {isBooked && primary ? (
                    <div className="bg-background p-1 min-h-[3.5rem]">
                      <Popover
                        open={popoverBooking?.id === primary.id}
                        onOpenChange={(o) => {
                          if (o) setPopoverBooking(primary);
                          else setPopoverBooking(null);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-full min-h-[3.25rem] w-full rounded-md bg-amber-100 px-2 py-2 text-left text-xs font-semibold uppercase tracking-tight text-amber-950 border border-amber-200/80 hover:bg-amber-200/80 transition-colors"
                          >
                            <span className="line-clamp-2">
                              {bookingDisplayLine(primary)}
                              {cellBookings.length > 1
                                ? ` +${cellBookings.length - 1}`
                                : ""}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="center" className="w-80">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs uppercase text-muted-foreground">
                                Pet
                              </p>
                              <p className="font-medium">
                                {primary.pets?.name ??
                                  primary.pet_name_raw ??
                                  "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-muted-foreground">
                                Owner
                              </p>
                              <p className="font-medium">
                                {primary.owners
                                  ? ownerLabel(primary.owners)
                                  : primary.owner_name_raw ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-muted-foreground">
                                Phone
                              </p>
                              <p className="font-medium">
                                {primary.owners?.phone ?? "—"}
                              </p>
                            </div>
                            <BookingProfileNotes
                              compact
                              ownerOtherNotes={primary.owners?.other_notes}
                              pets={[
                                {
                                  name:
                                    primary.pets?.name ??
                                    primary.pet_name_raw ??
                                    "Pet",
                                  otherNotes: primary.pets?.other_notes,
                                },
                              ]}
                            />
                            {primary.is_assessment && (
                              <Badge variant="outline" className="text-xs">
                                Assessment
                              </Badge>
                            )}
                            <Button
                              type="button"
                              variant="destructive"
                              className="w-full"
                              disabled={deleteBooking.isPending}
                              onClick={() => handleDeleteBooking(primary)}
                            >
                              {deleteBooking.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Cancel Booking
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <div className="bg-background p-1 min-h-[3.5rem]">
                      <button
                        type="button"
                        disabled={effectiveStatus === "closed"}
                        onClick={() =>
                          openNewBooking(slot.slot_start, slot.slot_end)
                        }
                        className="flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center rounded-md bg-muted/40 text-muted-foreground hover:bg-muted/70 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
          {bookingsLoading && (
            <p className="p-3 text-xs text-muted-foreground text-center">
              Loading bookings…
            </p>
          )}
        </div>
      </main>

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New park booking</SheetTitle>
            <SheetDescription>
              Add one or more pets for this lane and time slot.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="grid gap-2">
              <Label>Time slot</Label>
              <Input value={slotLabelReadOnly} readOnly className="bg-muted/50" />
            </div>
            <div className="grid gap-2">
              <Label>Owner</Label>
              <ParkOwnerSearch
                selectedOwnerId={ownerId}
                selectedLabel={ownerLabel}
                onSelect={(id, label) => {
                  setOwnerId(id);
                  setOwnerLabel(label);
                  setSelectedPetIds(new Set());
                }}
                onClear={() => {
                  setOwnerId(null);
                  setOwnerLabel(null);
                  setSelectedPetIds(new Set());
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label>Pets</Label>
              {!ownerId ? (
                <p className="text-sm text-muted-foreground">
                  Select an owner to list pets.
                </p>
              ) : pets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pets on file.</p>
              ) : (
                <ul className="space-y-2 rounded-md border p-3 max-h-48 overflow-y-auto">
                  {pets.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`park-pet-${p.id}`}
                        checked={selectedPetIds.has(p.id)}
                        onCheckedChange={() => togglePet(p.id)}
                      />
                      <label
                        htmlFor={`park-pet-${p.id}`}
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {p.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
              <Label htmlFor="park-assessment" className="cursor-pointer">
                Assessment visit
              </Label>
              <Switch
                id="park-assessment"
                checked={isAssessment}
                onCheckedChange={setIsAssessment}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="park-notes">Notes</Label>
              <Input
                id="park-notes"
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                placeholder="Optional…"
              />
            </div>
          </div>

          <SheetFooter className="mt-8 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeSheet}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveBookings}
              disabled={createBooking.isPending}
            >
              {createBooking.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ParkPage;
