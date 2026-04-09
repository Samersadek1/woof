import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, differenceInCalendarDays, isToday, parseISO } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import {
  useBookings,
  useRooms,
  useCreateBooking,
  useUpdateBooking,
} from "@/hooks/useBookings";
import type { BookingWithDetails, CreateBookingPayload } from "@/hooks/useBookings";
import { useOwners } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import { CheckInSheet } from "@/components/CheckInSheet";
import { CheckOutSheet } from "@/components/CheckOutSheet";
import { CAT_BOARDING_SECTION_ID } from "@/lib/boardingLabels";
import { bookingBelongingsCount } from "@/lib/bookingUtils";
import { CatBoardingCalendar } from "@/pages/Cattery";
import { ChevronLeft, ChevronRight, Plus, Loader2, ExternalLink, Eye, Luggage } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ─── types ────────────────────────────────────────────────────────────────────
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type RoomWing = Database["public"]["Enums"]["room_wing"];

const DAYS = 14;
const ROOM_COL_W = 160; // px
const DAY_COL_W = 100;  // px

const WING_LABELS: Record<RoomWing, string> = {
  oxford: "Oxford Street",
  piccadilly: "Piccadilly",
  park_lane: "Park Lane",
  fleet: "Fleet Street",
  back_kennels: "Back Kennels",
  cattery: "Cattery",
  grooming_upstairs: "Grooming Upstairs",
};

/** Dog kennel wings only (cat boarding uses separate rooms under Cat boarding tab). */
const WING_ORDER: RoomWing[] = [
  "oxford",
  "piccadilly",
  "park_lane",
  "fleet",
  "back_kennels",
];

const STATUS_CLASSES: Record<BookingStatus, string> = {
  confirmed: "bg-blue-500 text-white hover:bg-blue-600",
  checked_in: "bg-emerald-500 text-white hover:bg-emerald-600",
  checked_out: "bg-slate-400 text-white hover:bg-slate-500",
  enquiry: "bg-amber-400 text-white hover:bg-amber-500",
  cancelled: "bg-red-400 text-white hover:bg-red-500",
  no_show: "bg-rose-300 text-white hover:bg-rose-400",
};

const STATUS_BADGE: Record<BookingStatus, string> = {
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  checked_in: "bg-emerald-100 text-emerald-800 border-emerald-200",
  checked_out: "bg-slate-100 text-slate-600 border-slate-200",
  enquiry: "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  no_show: "bg-rose-100 text-rose-700 border-rose-200",
};

// ─── date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

// ─── initial form state ───────────────────────────────────────────────────────
type NewBookingForm = {
  owner_id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  pet_ids: string[];
  notes: string;
  staff_id: string;
  do_not_move: boolean;
  pickup_required: boolean;
  dropoff_required: boolean;
  addon_transport_dubai: boolean;
  addon_transport_abudhabi: boolean;
  addon_groom: boolean;
  addon_bath: boolean;
};

const BLANK_FORM: NewBookingForm = {
  owner_id: "",
  room_id: "",
  check_in_date: "",
  check_out_date: "",
  pet_ids: [],
  notes: "",
  staff_id: "",
  do_not_move: false,
  pickup_required: false,
  dropoff_required: false,
  addon_transport_dubai: false,
  addon_transport_abudhabi: false,
  addon_groom: false,
  addon_bath: false,
};

export type DogBoardingCalendarProps = {
  windowStart: Date;
  onWindowStartChange: React.Dispatch<React.SetStateAction<Date>>;
  /** Hub renders the shared week toolbar */
  suppressToolbar?: boolean;
};

// ─── dog boarding calendar (no TopBar — used inside Boarding hub) ─────────────
export function DogBoardingCalendar({
  windowStart,
  onWindowStartChange,
  suppressToolbar,
}: DogBoardingCalendarProps) {
  const navigate = useNavigate();
  const today = new Date();

  const windowEnd = addDays(windowStart, DAYS - 1);

  const startStr = toDateStr(windowStart);
  const endStr = toDateStr(windowEnd);

  // data
  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(startStr, endStr);
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();

  // drawer / panel state
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<BookingWithDetails | null>(null);
  const [form, setForm] = useState<NewBookingForm>({ ...BLANK_FORM });
  const [checkInSheetOpen, setCheckInSheetOpen] = useState(false);
  const [checkOutSheetOpen, setCheckOutSheetOpen] = useState(false);
  const [belongingsReadOnly, setBelongingsReadOnly] = useState(false);

  // owner search
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerPopOpen, setOwnerPopOpen] = useState(false);
  const { data: ownerResults = [] } = useOwners(ownerSearch.trim().length >= 2 ? ownerSearch : undefined);

  // pets for selected owner (dog boarding: exclude cats)
  const { data: ownerPets = [] } = usePets(form.owner_id);
  const dogBoardingPets = useMemo(
    () => ownerPets.filter((p) => p.species !== "cat"),
    [ownerPets],
  );

  // mutations
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

  const handleBelongingsFlowFinished = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    setDetailBooking(null);
    setCheckInSheetOpen(false);
    setCheckOutSheetOpen(false);
    setBelongingsReadOnly(false);
  };

  // days array for column headers
  const days = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => addDays(windowStart, i));
  }, [windowStart]);

  // rooms grouped by wing
  const roomsByWing = useMemo(() => {
    const map = new Map<RoomWing, typeof rooms>();
    WING_ORDER.forEach((w) => map.set(w, []));
    rooms.forEach((r) => {
      const wing = r.wing as RoomWing;
      if (map.has(wing)) map.get(wing)!.push(r);
    });
    return map;
  }, [rooms]);

  // booking lookup: roomId → bookings (for this window)
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, BookingWithDetails[]>();
    bookings.forEach((b) => {
      const list = map.get(b.room_id) ?? [];
      list.push(b);
      map.set(b.room_id, list);
    });
    return map;
  }, [bookings]);

  // open new booking drawer, optionally pre-fill room + date
  const openNewBooking = (roomId?: string, date?: string) => {
    setForm({
      ...BLANK_FORM,
      room_id: roomId ?? "",
      check_in_date: date ?? "",
      check_out_date: date ? toDateStr(addDays(parseISO(date), 1)) : "",
    });
    setOwnerSearch("");
    setNewBookingOpen(true);
  };

  // clear pets when owner changes
  useEffect(() => {
    setForm((f) => ({ ...f, pet_ids: [] }));
  }, [form.owner_id]);

  const togglePet = (petId: string) => {
    setForm((f) => ({
      ...f,
      pet_ids: f.pet_ids.includes(petId)
        ? f.pet_ids.filter((id) => id !== petId)
        : [...f.pet_ids, petId],
    }));
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.owner_id || !form.room_id || !form.check_in_date || !form.check_out_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.pet_ids.length === 0) {
      toast.error("Select at least one pet for this stay");
      return;
    }
    const catInSelection = form.pet_ids.some(
      (id) => ownerPets.find((p) => p.id === id)?.species === "cat",
    );
    if (catInSelection) {
      toast.error("Cats belong in Cat boarding — switch to Cats above");
      return;
    }
    const selectedRoom = rooms.find((r) => r.id === form.room_id);
    if (selectedRoom?.wing === "cattery") {
      toast.error("Cannot book a dog into a cattery room");
      return;
    }

    // build add-ons note suffix
    const addons = [
      form.addon_transport_dubai && "Transport Dubai",
      form.addon_transport_abudhabi && "Transport Abu Dhabi",
      form.addon_groom && "Full Groom on checkout",
      form.addon_bath && "Full Bath on checkout",
    ]
      .filter(Boolean)
      .join(", ");

    const payload: CreateBookingPayload = {
      owner_id: form.owner_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      notes: [form.notes, addons ? `Add-ons: ${addons}` : ""]
        .filter(Boolean)
        .join("\n"),
      do_not_move: form.do_not_move,
      pickup_required: form.pickup_required,
      dropoff_required: form.dropoff_required,
      staff_id: form.staff_id || null,
      status: "confirmed",
    };

    createBooking.mutate(payload, {
      onSuccess: () => {
        toast.success("Booking created");
        setNewBookingOpen(false);
      },
      onError: (err) => toast.error(err.message || "Failed to create booking"),
    });
  };

  // ─── calendar rendering helpers ───────────────────────────────────────────

  // for a given room row, render booking chips + empty cells
  const renderRoomRow = (roomId: string) => {
    const roomBookings = bookingsByRoom.get(roomId) ?? [];

    // build a day → booking map (only show chip on first visible day)
    const dayBookingMap = new Map<string, { booking: BookingWithDetails; span: number; isFirst: boolean }>();

    roomBookings.forEach((b) => {
      const ciDate = parseISO(b.check_in_date);
      const coDate = parseISO(b.check_out_date);

      days.forEach((day, idx) => {
        const dayStr = toDateStr(day);
        if (dayStr >= b.check_in_date && dayStr < b.check_out_date) {
          // is this the first visible day of the booking?
          const isFirst = dayStr === b.check_in_date || idx === 0;
          if (isFirst) {
            // calculate how many cells this chip spans (capped at remaining days)
            const endOfWindow = toDateStr(addDays(windowStart, DAYS));
            const chipEnd = b.check_out_date < endOfWindow ? b.check_out_date : endOfWindow;
            const span = differenceInCalendarDays(
              parseISO(chipEnd),
              parseISO(dayStr === b.check_in_date ? b.check_in_date : toDateStr(day))
            );
            dayBookingMap.set(dayStr, { booking: b, span: Math.max(span, 1), isFirst: true });
          } else if (!dayBookingMap.has(dayStr)) {
            dayBookingMap.set(dayStr, { booking: b, span: 1, isFirst: false });
          }
        }
      });
    });

    return (
      <div className="flex">
        {days.map((day) => {
          const dayStr = toDateStr(day);
          const entry = dayBookingMap.get(dayStr);
          const todayHighlight = isToday(day);

          if (!entry) {
            return (
              <div
                key={dayStr}
                style={{ minWidth: DAY_COL_W, width: DAY_COL_W }}
                className={`h-12 border-r border-b border-border cursor-pointer transition-colors
                  ${todayHighlight ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-muted/50"}`}
                onClick={() => openNewBooking(roomId, dayStr)}
              />
            );
          }

          if (!entry.isFirst) {
            // continuation cell — just a coloured bar, not clickable as chip
            return (
              <div
                key={dayStr}
                style={{ minWidth: DAY_COL_W, width: DAY_COL_W }}
                className={`h-12 border-r border-b border-border ${todayHighlight ? "bg-amber-50" : ""}`}
              />
            );
          }

          const { booking, span } = entry;
          const label = [
            booking.booking_pets?.[0]?.pets?.name?.toUpperCase() ?? "",
            booking.owners?.last_name?.toUpperCase() ?? "",
          ]
            .filter(Boolean)
            .join(" – ");

          return (
            <div
              key={dayStr}
              style={{
                minWidth: DAY_COL_W * span - 4,
                width: DAY_COL_W * span - 4,
                marginLeft: 2,
                marginRight: 2,
              }}
              className={`relative h-10 mt-1 rounded text-xs font-medium px-2 flex items-center gap-1
                cursor-pointer truncate z-10 select-none
                ${STATUS_CLASSES[booking.status]}`}
              onClick={() => setDetailBooking(booking)}
            >
              <span className="truncate min-w-0 flex-1">{label || booking.booking_ref || "—"}</span>
              {booking.booking_pets.length > 1 && (
                <span className="shrink-0 opacity-80">+{booking.booking_pets.length - 1}</span>
              )}
              {bookingBelongingsCount(booking) > 0 ? (
                <Luggage className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const isLoading = bookingsLoading || roomsLoading;

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
      <>
      <main className={`flex flex-col ${suppressToolbar ? "" : "flex-1 overflow-hidden"}`}>
        {!suppressToolbar ? (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => onWindowStartChange((d) => addDays(d, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => onWindowStartChange(startOfWeek(today, { weekStartsOn: 1 }))}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => onWindowStartChange((d) => addDays(d, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm font-medium text-foreground">
                {format(windowStart, "d MMM")} – {format(windowEnd, "d MMM yyyy")}
              </span>
            </div>
            <Button onClick={() => openNewBooking()}>
              <Plus className="mr-2 h-4 w-4" />
              New booking
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end px-6 py-2 border-b border-border bg-slate-50/90 shrink-0">
            <Button size="sm" onClick={() => openNewBooking()}>
              <Plus className="mr-2 h-4 w-4" />
              New dog booking
            </Button>
          </div>
        )}

        {/* ── Calendar ── */}
        <div className={suppressToolbar ? "" : "flex-1 overflow-auto"}>
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}>

              {/* Sticky header row */}
              <div className="flex sticky top-0 z-20 bg-card border-b border-border">
                <div
                  style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                  className="shrink-0 border-r border-border"
                />
                {days.map((day) => {
                  const todayHighlight = isToday(day);
                  return (
                    <div
                      key={toDateStr(day)}
                      style={{ minWidth: DAY_COL_W, width: DAY_COL_W }}
                      className={`border-r border-border text-center py-2 text-xs font-medium
                        ${todayHighlight ? "bg-amber-100 text-amber-900" : "text-muted-foreground"}`}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div className={`text-sm ${todayHighlight ? "font-bold" : "font-normal"}`}>
                        {format(day, "d")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Wing groups + room rows */}
              {WING_ORDER.map((wing) => {
                const wingRooms = roomsByWing.get(wing) ?? [];
                if (wingRooms.length === 0) return null;
                return (
                  <div key={wing}>
                    {/* Wing header */}
                    <div
                      className="flex sticky left-0 bg-slate-50 border-b border-t border-border"
                      style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}
                    >
                      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {WING_LABELS[wing]}
                      </div>
                    </div>

                    {/* Room rows */}
                    {wingRooms.map((room) => (
                      <div key={room.id} className="flex">
                        {/* Room label */}
                        <div
                          style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                          className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card"
                        >
                          <span className="truncate">{room.display_name}</span>
                        </div>
                        {/* Day cells */}
                        {renderRoomRow(room.id)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════
          NEW BOOKING DRAWER
      ══════════════════════════════════════════ */}
      <Sheet open={newBookingOpen} onOpenChange={setNewBookingOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Booking</SheetTitle>
            <SheetDescription>
              Dog boarding — only dogs (and non-cat pets) appear below. Pick a room in the kennel grid.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateBooking} className="mt-6 space-y-5">

            {/* Owner search */}
            <div className="space-y-2">
              <Label>Owner <span className="text-destructive">*</span></Label>
              <Popover open={ownerPopOpen} onOpenChange={setOwnerPopOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Input
                      placeholder="Search by name or phone…"
                      value={ownerSearch}
                      onChange={(e) => {
                        setOwnerSearch(e.target.value);
                        setOwnerPopOpen(true);
                      }}
                      onFocus={() => ownerSearch.length >= 2 && setOwnerPopOpen(true)}
                    />
                  </div>
                </PopoverTrigger>
                {ownerResults.length > 0 && (
                  <PopoverContent align="start" className="p-1 w-80">
                    {ownerResults.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent"
                        onClick={() => {
                          setForm((f) => ({ ...f, owner_id: o.id }));
                          setOwnerSearch(`${o.first_name} ${o.last_name} — ${o.phone}`);
                          setOwnerPopOpen(false);
                        }}
                      >
                        <span className="font-medium">{o.first_name} {o.last_name}</span>
                        <span className="ml-2 text-muted-foreground">{o.phone}</span>
                      </button>
                    ))}
                  </PopoverContent>
                )}
              </Popover>
            </div>

            {/* Pet selector — dog boarding only */}
            {form.owner_id && (
              <div className="space-y-2">
                <Label>Pets</Label>
                {ownerPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pets registered for this owner.</p>
                ) : dogBoardingPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This owner only has cats — use <strong>Cat boarding</strong> below for those stays.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dogBoardingPets.map((pet) => (
                      <div key={pet.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`pet-${pet.id}`}
                          checked={form.pet_ids.includes(pet.id)}
                          onCheckedChange={() => togglePet(pet.id)}
                        />
                        <Label htmlFor={`pet-${pet.id}`} className="cursor-pointer font-normal">
                          {pet.name}
                          <span className="ml-1 text-muted-foreground text-xs capitalize">({pet.species})</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Room */}
            <div className="space-y-2">
              <Label>Room <span className="text-destructive">*</span></Label>
              <Select value={form.room_id} onValueChange={(v) => setForm((f) => ({ ...f, room_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {WING_ORDER.map((wing) => {
                    const wr = (roomsByWing.get(wing) ?? []);
                    if (wr.length === 0) return null;
                    return (
                      <div key={wing}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                          {WING_LABELS[wing]}
                        </div>
                        {wr.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.check_in_date}
                  onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Check-out <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.check_out_date}
                  onChange={(e) => setForm((f) => ({ ...f, check_out_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Transport</Label>
              <p className="text-xs text-muted-foreground">
                Collection for check-in and return delivery after check-out.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pickup_required"
                  checked={form.pickup_required}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, pickup_required: !!v }))
                  }
                />
                <Label htmlFor="pickup_required" className="cursor-pointer font-normal">
                  Pickup required (to facility)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dropoff_required"
                  checked={form.dropoff_required}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, dropoff_required: !!v }))
                  }
                />
                <Label htmlFor="dropoff_required" className="cursor-pointer font-normal">
                  Drop-off required (after stay)
                </Label>
              </div>
            </div>

            <Separator />

            {/* Add-ons */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add-ons</Label>
              <div className="space-y-2">
                {[
                  { key: "addon_transport_dubai", label: "Transport — Dubai" },
                  { key: "addon_transport_abudhabi", label: "Transport — Abu Dhabi" },
                  { key: "addon_groom", label: "Full Groom on checkout" },
                  { key: "addon_bath", label: "Full Bath on checkout" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={key}
                      checked={form[key as keyof NewBookingForm] as boolean}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: !!v }))}
                    />
                    <Label htmlFor={key} className="cursor-pointer font-normal">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Do Not Move */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="do_not_move" className="cursor-pointer">DO NOT MOVE</Label>
              <Switch
                id="do_not_move"
                checked={form.do_not_move}
                onCheckedChange={(v) => setForm((f) => ({ ...f, do_not_move: v }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Staff name */}
            <div className="space-y-2">
              <Label>Staff name</Label>
              <Input
                placeholder="Who is creating this booking?"
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
              />
            </div>

            <Button type="submit" className="w-full" disabled={createBooking.isPending}>
              {createBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Booking
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════
          BOOKING DETAIL PANEL
      ══════════════════════════════════════════ */}
      <Sheet
        open={!!detailBooking}
        onOpenChange={(open) => {
          if (!open) {
            setDetailBooking(null);
            setCheckInSheetOpen(false);
            setCheckOutSheetOpen(false);
            setBelongingsReadOnly(false);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailBooking && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detailBooking.booking_ref ?? "Booking Details"}
                </SheetTitle>
                <SheetDescription>
                  Reservation overview and actions.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">

                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={STATUS_BADGE[detailBooking.status]}>
                    {detailBooking.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                  {detailBooking.do_not_move && (
                    <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                      DO NOT MOVE
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Owner */}
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Owner</p>
                  <button
                    className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => navigate(`/customers/${detailBooking.owner_id}`)}
                  >
                    {detailBooking.owners?.first_name} {detailBooking.owners?.last_name}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>

                {/* Pets */}
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">
                    Pet{detailBooking.booking_pets.length !== 1 ? "s" : ""}
                  </p>
                  {detailBooking.booking_pets.length === 0 ? (
                    <p className="text-sm">—</p>
                  ) : (
                    <p className="text-sm flex flex-wrap gap-x-1 gap-y-0.5">
                      {detailBooking.booking_pets.map((bp, i) => (
                        <span key={bp.pet_id}>
                          {i > 0 ? <span className="text-muted-foreground">, </span> : null}
                          <button
                            type="button"
                            className="font-medium text-primary hover:underline"
                            onClick={() =>
                              navigate(
                                `/customers/${detailBooking.owner_id}/pets/${bp.pet_id}`
                              )
                            }
                          >
                            {bp.pets?.name ?? "Unknown"}
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                <BookingProfileNotes
                  ownerOtherNotes={detailBooking.owners?.other_notes}
                  pets={detailBooking.booking_pets.map((bp) => ({
                    name: bp.pets?.name ?? "Pet",
                    otherNotes: bp.pets?.other_notes,
                  }))}
                />

                {/* Room */}
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Room</p>
                  <p className="text-sm">{detailBooking.rooms?.display_name ?? "—"}</p>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
                    <p className="text-sm">{format(parseISO(detailBooking.check_in_date), "d MMM yyyy")}</p>
                    {detailBooking.actual_check_in_at && (
                      <p className="text-xs text-muted-foreground">
                        Actual: {format(parseISO(detailBooking.actual_check_in_at), "d MMM HH:mm")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
                    <p className="text-sm">{format(parseISO(detailBooking.check_out_date), "d MMM yyyy")}</p>
                    {detailBooking.actual_check_out_at && (
                      <p className="text-xs text-muted-foreground">
                        Actual: {format(parseISO(detailBooking.actual_check_out_at), "d MMM HH:mm")}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date)} night
                  {nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date) !== 1 ? "s" : ""}
                </p>

                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Transport</p>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="detail_pickup_required" className="font-normal text-sm cursor-pointer">
                      Pickup (check-in)
                    </Label>
                    <Switch
                      id="detail_pickup_required"
                      checked={detailBooking.pickup_required}
                      disabled={updateBooking.isPending}
                      onCheckedChange={(v) => {
                        const id = detailBooking.id;
                        updateBooking.mutate(
                          { id, pickup_required: v },
                          {
                            onSuccess: () =>
                              setDetailBooking((prev) =>
                                prev && prev.id === id ? { ...prev, pickup_required: v } : prev,
                              ),
                            onError: (err) => toast.error(err.message),
                          },
                        );
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="detail_dropoff_required" className="font-normal text-sm cursor-pointer">
                      Drop-off (check-out)
                    </Label>
                    <Switch
                      id="detail_dropoff_required"
                      checked={detailBooking.dropoff_required}
                      disabled={updateBooking.isPending}
                      onCheckedChange={(v) => {
                        const id = detailBooking.id;
                        updateBooking.mutate(
                          { id, dropoff_required: v },
                          {
                            onSuccess: () =>
                              setDetailBooking((prev) =>
                                prev && prev.id === id ? { ...prev, dropoff_required: v } : prev,
                              ),
                            onError: (err) => toast.error(err.message),
                          },
                        );
                      }}
                    />
                  </div>
                </div>

                {/* Notes */}
                {detailBooking.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                    <p className="text-sm whitespace-pre-line">{detailBooking.notes}</p>
                  </div>
                )}

                <Separator />

                {/* Actions */}
                <div className="space-y-3">

                  {detailBooking.status === "confirmed" && (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        setBelongingsReadOnly(false);
                        setCheckInSheetOpen(true);
                      }}
                    >
                      Check In
                    </Button>
                  )}

                  {detailBooking.status === "checked_in" && (
                    <div className="flex flex-col gap-2">
                      <Button className="w-full" variant="outline" onClick={() => setCheckOutSheetOpen(true)}>
                        Check Out
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setBelongingsReadOnly(true);
                          setCheckInSheetOpen(true);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Belongings
                      </Button>
                    </div>
                  )}

                  {/* ── Cancel Booking ── */}
                  {(detailBooking.status === "confirmed" || detailBooking.status === "enquiry") && (
                    <Button
                      variant="outline"
                      className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                      disabled={updateBooking.isPending}
                      onClick={() =>
                        updateBooking.mutate(
                          { id: detailBooking.id, status: "cancelled" },
                          {
                            onSuccess: () => {
                              toast.success("Booking cancelled");
                              setDetailBooking(null);
                            },
                            onError: (err) => toast.error(err.message),
                          }
                        )
                      }
                    >
                      {updateBooking.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Cancel Booking
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {detailBooking && (
        <>
          <CheckInSheet
            open={checkInSheetOpen}
            onOpenChange={(o) => {
              if (!o) {
                setCheckInSheetOpen(false);
                setBelongingsReadOnly(false);
              }
            }}
            bookingId={detailBooking.id}
            ownerName={`${detailBooking.owners?.first_name ?? ""} ${detailBooking.owners?.last_name ?? ""}`.trim()}
            petNames={detailBooking.booking_pets.map((bp) => bp.pets?.name).filter(Boolean).join(", ")}
            roomName={detailBooking.rooms?.display_name ?? "—"}
            bookedCheckInDate={detailBooking.check_in_date}
            bookedCheckOutDate={detailBooking.check_out_date}
            readOnly={belongingsReadOnly}
            onFinished={handleBelongingsFlowFinished}
          />
          <CheckOutSheet
            open={checkOutSheetOpen}
            onOpenChange={(o) => {
              if (!o) setCheckOutSheetOpen(false);
            }}
            bookingId={detailBooking.id}
            ownerName={`${detailBooking.owners?.first_name ?? ""} ${detailBooking.owners?.last_name ?? ""}`.trim()}
            petNames={detailBooking.booking_pets.map((bp) => bp.pets?.name).filter(Boolean).join(", ")}
            roomName={detailBooking.rooms?.display_name ?? "—"}
            checkInDate={detailBooking.check_in_date}
            checkOutDate={detailBooking.check_out_date}
            onFinished={handleBelongingsFlowFinished}
          />
        </>
      )}
    </>
  );
}

type Species = "dog" | "cat";

function BoardingHubPage() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const location = useLocation();

  const initialSpecies: Species =
    location.hash === `#${CAT_BOARDING_SECTION_ID}` ? "cat" : "dog";
  const [species, setSpecies] = useState<Species>(initialSpecies);

  const [windowStart, setWindowStart] = useState(() =>
    startOfWeek(today, { weekStartsOn: 1 }),
  );
  const windowEnd = addDays(windowStart, DAYS - 1);

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      <TopBar title="Boarding" />

      {/* ── Toolbar: week nav + species toggle + manage rooms ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWindowStart((d) => addDays(d, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWindowStart(startOfWeek(today, { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWindowStart((d) => addDays(d, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-foreground">
            {format(windowStart, "d MMM")} – {format(windowEnd, "d MMM yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Species toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${species === "dog" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => setSpecies("dog")}
            >
              Dogs
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${species === "cat" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => setSpecies("cat")}
            >
              Cats
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/settings/rooms?species=${species}`)}
          >
            Manage Rooms
          </Button>
        </div>
      </div>

      {/* ── Calendar (only one rendered at a time) ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {species === "dog" ? (
          <DogBoardingCalendar
            windowStart={windowStart}
            onWindowStartChange={setWindowStart}
            suppressToolbar
          />
        ) : (
          <CatBoardingCalendar
            windowStart={windowStart}
            onWindowStartChange={setWindowStart}
            suppressToolbar
          />
        )}
      </div>
    </div>
  );
}

export default BoardingHubPage;
