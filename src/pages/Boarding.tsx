import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { formatBookingCell, bookingBelongingsCount, createBookingInvoice, ownerDisplayName } from "@/lib/bookingUtils";
import { boardCheckoutGroomingAddon } from "@/lib/groomingCatalog";
import { resolveBoardingRate } from "@/lib/boardingPricing";
import {
  TRANSPORT_PRICING_KEYS,
  TRANSPORT_ZONE_OPTIONS,
  type TransportZone,
  privateDubaiOverCapacity,
  transportPricingKey,
  transportQuantityForPets,
  transportZoneLabel,
} from "@/lib/transportPricing";
import { buildBoardingTags, tagToneClass } from "@/lib/operationsTags";
import { ChevronLeft, ChevronRight, Plus, Loader2, ExternalLink, Eye, Luggage, Printer } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

// ─── types ────────────────────────────────────────────────────────────────────
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type RoomWing = Database["public"]["Enums"]["room_wing"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];
type CatRoomType =
  | "cattery_super_presidential"
  | "cattery_presidential"
  | "cattery_deluxe";

const DAYS = 14;
const ROOM_COL_W = 160; // px
const DAY_COL_W = 100;  // px

const WING_LABELS: Record<RoomWing, string> = {
  oxford: "Oxford Street",
  piccadilly: "Piccadilly",
  park_lane: "Park Lane",
  fleet: "Fleet Street",
  back_kennels: "Back Kennels",
  cattery: "Cat Boarding",
  grooming_upstairs: "Grooming Upstairs",
};

const WING_ORDER: RoomWing[] = [
  "oxford",
  "piccadilly",
  "park_lane",
  "fleet",
  "back_kennels",
];

const CAT_TIER_ORDER: CatRoomType[] = [
  "cattery_super_presidential",
  "cattery_presidential",
  "cattery_deluxe",
];

const CAT_TIER_LABELS: Record<CatRoomType, string> = {
  cattery_super_presidential: "Super Presidential",
  cattery_presidential: "Presidential",
  cattery_deluxe: "Deluxe",
};

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

function formatAed(value: number): string {
  return `AED ${value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderKennelCardHtml(booking: BookingWithDetails, todayDate: string): string {
  const ownerName = ownerDisplayName(booking.owners?.first_name, booking.owners?.last_name);
  const roomName = booking.rooms?.room_number ?? booking.rooms?.display_name ?? "—";
  const notes = booking.notes || "No booking notes";
  const bookingRef = booking.booking_ref ?? booking.id.slice(0, 8);
  const status = booking.status.replace(/_/g, " ");
  const nights = nightsBetween(booking.check_in_date, booking.check_out_date);
  const petItems = booking.booking_pets
    .map((bp) => {
      const petName = bp.pets?.name ?? "Unknown pet";
      const petNote = bp.pets?.other_notes?.trim();
      const feeding = (bp.feeding_notes ?? bp.pets?.feeding_instructions ?? "").trim();
      const medication = (bp.medication_notes ?? bp.pets?.medications ?? "").trim();
      const special = (bp.special_instructions ?? "").trim();
      return `<li>
        <strong>${escapeHtml(petName)}</strong>
        ${feeding ? `<div class="sub">Feeding: ${escapeHtml(feeding)}</div>` : `<div class="sub">Feeding: —</div>`}
        ${medication ? `<div class="sub">Medication: ${escapeHtml(medication)}</div>` : `<div class="sub">Medication: —</div>`}
        ${special ? `<div class="sub">Special instructions: ${escapeHtml(special)}</div>` : ""}
        ${petNote ? `<div class="sub">Profile note: ${escapeHtml(petNote)}</div>` : ""}
      </li>`;
    })
    .join("");
  const ownerNote = booking.owners?.other_notes?.trim();
  const tags = buildBoardingTags({
    status: booking.status,
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
    todayDate,
  }).map((tag) => `<span class="tag">${escapeHtml(tag.label)}</span>`).join("");
  const belongingsCount = bookingBelongingsCount(booking);

  return `
    <section class="card">
      <h1>Kennel Card</h1>
      <div class="meta">Booking: ${escapeHtml(bookingRef)}</div>
      <div class="meta">Status: ${escapeHtml(status)}</div>
      <div class="tags">${tags || '<span class="tag">No tags</span>'}</div>

      <div class="label">Pets (full list)</div>
      <ul class="list">${petItems || "<li>—</li>"}</ul>

      <div class="label">Owner</div>
      <div class="value">${escapeHtml(ownerName)}</div>
      <div class="sub">${ownerNote ? `Owner note: ${escapeHtml(ownerNote)}` : "Owner note: —"}</div>

      <div class="grid">
        <div><div class="label">Room</div><div class="value">${escapeHtml(roomName)}</div></div>
        <div><div class="label">Nights</div><div class="value">${nights}</div></div>
        <div><div class="label">Check-in</div><div class="value">${escapeHtml(booking.check_in_date)}</div></div>
        <div><div class="label">Check-out</div><div class="value">${escapeHtml(booking.check_out_date)}</div></div>
      </div>

      <div class="grid">
        <div><div class="label">Pickup</div><div class="value">${booking.pickup_required ? "Yes" : "No"}</div></div>
        <div><div class="label">Drop-off</div><div class="value">${booking.dropoff_required ? "Yes" : "No"}</div></div>
        <div><div class="label">Belongings</div><div class="value">${belongingsCount}</div></div>
      </div>

      <div class="grid">
        <div><div class="label">Do Not Move</div><div class="value">${booking.do_not_move ? "Yes" : "No"}</div></div>
        <div><div class="label">Staff ID</div><div class="value">${escapeHtml(booking.staff_id ?? "—")}</div></div>
      </div>

      <div class="label">Booking notes</div>
      <div class="value">${escapeHtml(notes)}</div>
    </section>
  `;
}

async function hydrateBookingsForPrint(bookings: BookingWithDetails[]): Promise<BookingWithDetails[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, other_notes, feeding_instructions, medications)), booking_items(count)",
    )
    .in("id", ids);

  if (error || !data) return bookings;
  const byId = new Map<string, BookingWithDetails>();
  for (const row of data as unknown as BookingWithDetails[]) byId.set(row.id, row);
  return bookings.map((b) => byId.get(b.id) ?? b);
}

async function printKennelCards(bookings: BookingWithDetails[], printTitle: string) {
  if (bookings.length === 0) return;
  const todayDate = toDateStr(new Date());
  const freshBookings = await hydrateBookingsForPrint(bookings);
  const cardsHtml = freshBookings.map((b) => renderKennelCardHtml(b, todayDate)).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(printTitle)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #111; }
    .card { border: 2px solid #111; border-radius: 10px; padding: 14px; margin: 0 auto 16px; max-width: 720px; break-inside: avoid; page-break-inside: avoid; }
    h1 { margin: 0 0 8px; font-size: 21px; }
    .meta { margin: 2px 0; font-size: 13px; }
    .label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: .04em; margin-top: 8px; }
    .value { font-size: 14px; margin-top: 2px; white-space: pre-wrap; }
    .sub { font-size: 12px; color: #555; margin-top: 2px; }
    .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px 14px; margin-top: 6px; }
    .list { margin: 4px 0 0 18px; padding: 0; font-size: 14px; }
    .list li { margin-bottom: 4px; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag { display: inline-block; border: 1px solid #ccc; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    @media print {
      body { padding: 8px; }
      .card { margin-bottom: 12px; }
    }
  </style></head><body>${cardsHtml}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

async function printKennelCard(booking: BookingWithDetails) {
  const bookingRef = booking.booking_ref ?? booking.id.slice(0, 8);
  await printKennelCards([booking], `Kennel Card ${bookingRef}`);
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
  transport_zone: TransportZone;
  addon_groom: boolean;
  addon_bath: boolean;
  pet_care_by_pet_id: Record<
    string,
    {
      feeding_notes: string;
      medication_notes: string;
      special_instructions: string;
    }
  >;
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
  transport_zone: "dubai_shared",
  addon_groom: false,
  addon_bath: false,
  pet_care_by_pet_id: {},
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

  const { data: transportRates = [] } = useQuery({
    queryKey: ["pricing", "transport_zones", "boarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing")
        .select("key, amount_aed")
        .in("key", TRANSPORT_PRICING_KEYS as readonly string[] as string[]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeTransportRate = transportRates.find(
    (r) => r.key === transportPricingKey(form.transport_zone),
  );
  const dogRatePetCount = Math.max(1, form.pet_ids.length);
  const dogRatePreview = useQuery({
    queryKey: ["boarding_rate_preview", "dog", form.room_id, dogRatePetCount],
    enabled: !!form.room_id,
    queryFn: async () => resolveBoardingRate(form.room_id, dogRatePetCount),
  });

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
    setForm((f) => ({ ...f, pet_ids: [], pet_care_by_pet_id: {} }));
  }, [form.owner_id]);

  const getInitialPetCare = (petId: string) => {
    const pet = ownerPets.find((p) => p.id === petId);
    return {
      feeding_notes: pet?.feeding_instructions ?? "",
      medication_notes: pet?.medications ?? "",
      special_instructions: pet?.other_notes ?? "",
    };
  };

  const togglePet = (petId: string) => {
    setForm((f) => ({
      ...f,
      pet_ids: f.pet_ids.includes(petId)
        ? f.pet_ids.filter((id) => id !== petId)
        : [...f.pet_ids, petId],
      pet_care_by_pet_id: f.pet_ids.includes(petId)
        ? Object.fromEntries(
            Object.entries(f.pet_care_by_pet_id).filter(([id]) => id !== petId),
          )
        : {
            ...f.pet_care_by_pet_id,
            [petId]: f.pet_care_by_pet_id[petId] ?? getInitialPetCare(petId),
          },
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

    const transportLabel = transportZoneLabel(form.transport_zone);
    const addons = [
      form.pickup_required && `Pickup (${transportLabel})`,
      form.dropoff_required && `Drop-off (${transportLabel})`,
      form.addon_groom && "Full Groom on checkout",
      form.addon_bath && "Full Bath on checkout",
    ]
      .filter(Boolean)
      .join(", ");

    if (
      (form.pickup_required || form.dropoff_required) &&
      privateDubaiOverCapacity(form.transport_zone, form.pet_ids.length)
    ) {
      toast.error(
        "Private Dubai transport is capped at 3 dogs. Split the group or choose Dubai — Shared.",
      );
      return;
    }

    const payload: CreateBookingPayload = {
      owner_id: form.owner_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      pet_care_by_pet_id: form.pet_care_by_pet_id,
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
      onSuccess: (booking) => {
        toast.success("Booking created");
        setNewBookingOpen(false);

        const addonItems: { key: string; label: string; quantity?: number }[] = [];
        const tKey = transportPricingKey(form.transport_zone);
        const tZone = transportZoneLabel(form.transport_zone);
        const tQty = transportQuantityForPets(form.transport_zone, form.pet_ids.length);
        const tSuffix = tQty > 1 ? ` × ${tQty} dogs` : "";
        if (form.pickup_required) addonItems.push({ key: tKey, label: `Pickup — ${tZone}${tSuffix}`, quantity: tQty });
        if (form.dropoff_required) addonItems.push({ key: tKey, label: `Drop-off — ${tZone}${tSuffix}`, quantity: tQty });
        if (form.addon_groom) {
          const line = boardCheckoutGroomingAddon("full_groom");
          if (line) addonItems.push(line);
        }
        if (form.addon_bath) {
          const line = boardCheckoutGroomingAddon("full_bath");
          if (line) addonItems.push(line);
        }

        createBookingInvoice({
          bookingId: booking.id,
          ownerId: form.owner_id,
          serviceType: "boarding",
          roomId: form.room_id,
          roomType: selectedRoom?.room_type ?? "boarding",
          roomName: selectedRoom?.room_number,
          petCount: form.pet_ids.length,
          checkInDate: form.check_in_date,
          checkOutDate: form.check_out_date,
          addons: addonItems,
        }).then(() => {
          toast.success("Draft invoice created");
        }).catch((err) => {
          console.error("Auto-invoice failed:", err);
          toast.error("Invoice not created: " + (err?.message ?? "unknown error"));
        });
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
                          <span className="truncate" title={`${room.room_number} — ${room.room_type?.replace(/_/g, " ")} (${room.capacity_type})`}>
                            <span className="font-medium">{room.room_number}</span>
                            <span className="ml-1.5 text-[11px] text-muted-foreground capitalize">{room.room_type?.replace(/_/g, " ")} · {room.capacity_type}</span>
                          </span>
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
                          setOwnerSearch(`${ownerDisplayName(o.first_name, o.last_name)} — ${o.phone}`);
                          setOwnerPopOpen(false);
                        }}
                      >
                        <span className="font-medium">{ownerDisplayName(o.first_name, o.last_name)}</span>
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

            {form.pet_ids.length > 0 && (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Per-pet care (prefilled from profile)</Label>
                {form.pet_ids.map((petId) => {
                  const pet = ownerPets.find((p) => p.id === petId);
                  const care = form.pet_care_by_pet_id[petId] ?? getInitialPetCare(petId);
                  return (
                    <div key={petId} className="space-y-2 rounded border p-3">
                      <p className="text-sm font-semibold">{pet?.name ?? "Pet"}</p>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Feeding notes</Label>
                        <Textarea
                          rows={2}
                          value={care.feeding_notes}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, feeding_notes: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Medication notes</Label>
                        <Textarea
                          rows={2}
                          value={care.medication_notes}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, medication_notes: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Special instructions</Label>
                        <Textarea
                          rows={2}
                          value={care.special_instructions}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, special_instructions: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })}
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
                          <SelectItem key={r.id} value={r.id}>
                            {r.room_number} — <span className="capitalize text-muted-foreground">{r.room_type?.replace(/_/g, " ")} · {r.capacity_type}</span>
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.room_id && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  {dogRatePreview.isLoading ? (
                    <p className="text-xs text-muted-foreground">Resolving mapped price...</p>
                  ) : dogRatePreview.data ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Resolved nightly price ({dogRatePetCount} pet{dogRatePetCount !== 1 ? "s" : ""})
                      </p>
                      <p className="text-sm font-medium">
                        {formatAed(dogRatePreview.data.unitPrice)} <span className="text-xs text-muted-foreground">({dogRatePreview.data.pricingKey})</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Could not resolve mapped price yet.</p>
                  )}
                </div>
              )}
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
                  Pickup (to facility)
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
                  Drop-off (after stay)
                </Label>
              </div>
              {(form.pickup_required || form.dropoff_required) && (
                <div className="space-y-1 pt-1">
                  <Label className="text-xs text-muted-foreground font-normal">Transport option</Label>
                  <Select
                    value={form.transport_zone}
                    onValueChange={(v) => setForm((f) => ({ ...f, transport_zone: v as TransportZone }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_ZONE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeTransportRate && (() => {
                    const qty = transportQuantityForPets(form.transport_zone, form.pet_ids.length);
                    const over = privateDubaiOverCapacity(form.transport_zone, form.pet_ids.length);
                    const opt = TRANSPORT_ZONE_OPTIONS.find((o) => o.value === form.transport_zone);
                    return (
                      <>
                        <p className="text-xs text-muted-foreground">
                          AED {activeTransportRate.amount_aed.toFixed(2)} × {qty}
                          {form.transport_zone === "dubai_private" ? " (flat per trip)" : " per dog"}
                          {opt ? ` — ${opt.helper}` : ""}
                        </p>
                        {over && (
                          <p className="text-xs text-destructive">
                            Private is capped at 3 dogs. Switch to Shared or split the group.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <Separator />

            {/* Add-ons */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add-ons</Label>
              <div className="space-y-2">
                {[
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
                  <p className="text-sm font-medium">{detailBooking.rooms?.room_number ?? detailBooking.rooms?.display_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{detailBooking.rooms?.room_type?.replace(/_/g, " ") ?? ""} · {detailBooking.rooms?.capacity_type ?? ""} · {detailBooking.rooms?.wing?.replace(/_/g, " ") ?? ""}</p>
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

// ─── cat boarding form ────────────────────────────────────────────────────────

type CatBookingForm = {
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
  transport_zone: TransportZone;
  addon_groom: boolean;
  addon_bath: boolean;
  cat_litter_type: string;
  cat_indoor_only: boolean;
  cat_ok_share_family: boolean;
  cat_special_diet: string;
  pet_care_by_pet_id: Record<
    string,
    {
      feeding_notes: string;
      medication_notes: string;
      special_instructions: string;
    }
  >;
};

const CAT_BLANK_FORM: CatBookingForm = {
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
  transport_zone: "dubai_shared",
  addon_groom: false,
  addon_bath: false,
  cat_litter_type: "",
  cat_indoor_only: false,
  cat_ok_share_family: true,
  cat_special_diet: "",
  pet_care_by_pet_id: {},
};

function buildCatPreferencesNote(f: CatBookingForm): string {
  const lines = [
    "Cat preferences:",
    f.cat_litter_type.trim() ? `Litter type: ${f.cat_litter_type.trim()}` : null,
    `Indoor only: ${f.cat_indoor_only ? "Yes" : "No"}`,
    `OK to share with family cats: ${f.cat_ok_share_family ? "Yes" : "No"}`,
    f.cat_special_diet.trim() ? `Special diet: ${f.cat_special_diet.trim()}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

// ─── cat boarding calendar ───────────────────────────────────────────────────

type CatBoardingCalendarProps = {
  windowStart: Date;
  onWindowStartChange: React.Dispatch<React.SetStateAction<Date>>;
  suppressToolbar?: boolean;
};

function CatBoardingCalendar({
  windowStart,
  onWindowStartChange,
  suppressToolbar,
}: CatBoardingCalendarProps) {
  const navigate = useNavigate();
  const today = new Date();

  const windowEnd = addDays(windowStart, DAYS - 1);
  const startStr = toDateStr(windowStart);
  const endStr = toDateStr(windowEnd);

  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(startStr, endStr);
  const { data: roomsAll = [], isLoading: roomsLoading } = useRooms();

  const catRooms = useMemo(
    () => roomsAll.filter((r) => r.wing === "cattery"),
    [roomsAll],
  );

  const roomsByTier = useMemo(() => {
    const map = new Map<CatRoomType, Room[]>();
    CAT_TIER_ORDER.forEach((t) => map.set(t, []));
    catRooms.forEach((r) => {
      const rt = r.room_type as CatRoomType;
      if (map.has(rt)) map.get(rt)!.push(r);
    });
    return map;
  }, [catRooms]);

  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<BookingWithDetails | null>(null);
  const [form, setForm] = useState<CatBookingForm>({ ...CAT_BLANK_FORM });

  const [checkInSheetOpen, setCheckInSheetOpen] = useState(false);
  const [checkOutSheetOpen, setCheckOutSheetOpen] = useState(false);
  const [belongingsReadOnly, setBelongingsReadOnly] = useState(false);

  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerPopOpen, setOwnerPopOpen] = useState(false);
  const { data: ownerResults = [] } = useOwners(
    ownerSearch.trim().length >= 2 ? ownerSearch : undefined,
  );

  const { data: ownerPets = [] } = usePets(form.owner_id);
  const catPets = useMemo(
    () => ownerPets.filter((p) => p.species === "cat"),
    [ownerPets],
  );

  const createBookingMut = useCreateBooking();
  const updateBooking = useUpdateBooking();

  const { data: catTransportRates = [] } = useQuery({
    queryKey: ["pricing", "transport_zones", "boarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing")
        .select("key, amount_aed")
        .in("key", TRANSPORT_PRICING_KEYS as readonly string[] as string[]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const catActiveTransportRate = catTransportRates.find(
    (r) => r.key === transportPricingKey(form.transport_zone),
  );
  const catRatePetCount = Math.max(1, form.pet_ids.length);
  const catRatePreview = useQuery({
    queryKey: ["boarding_rate_preview", "cat", form.room_id, catRatePetCount],
    enabled: !!form.room_id,
    queryFn: async () => resolveBoardingRate(form.room_id, catRatePetCount),
  });

  const handleBelongingsFlowFinished = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    setDetailBooking(null);
    setCheckInSheetOpen(false);
    setCheckOutSheetOpen(false);
    setBelongingsReadOnly(false);
  };

  const days = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => addDays(windowStart, i));
  }, [windowStart]);

  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, BookingWithDetails[]>();
    bookings.forEach((b) => {
      const list = map.get(b.room_id) ?? [];
      list.push(b);
      map.set(b.room_id, list);
    });
    return map;
  }, [bookings]);

  const openNewBooking = (roomId?: string, date?: string) => {
    setForm({
      ...CAT_BLANK_FORM,
      room_id: roomId ?? "",
      check_in_date: date ?? "",
      check_out_date: date ? toDateStr(addDays(parseISO(date), 1)) : "",
    });
    setOwnerSearch("");
    setNewBookingOpen(true);
  };

  useEffect(() => {
    setForm((f) => ({ ...f, pet_ids: [], pet_care_by_pet_id: {} }));
  }, [form.owner_id]);

  const getInitialPetCare = (petId: string) => {
    const pet = ownerPets.find((p) => p.id === petId);
    return {
      feeding_notes: pet?.feeding_instructions ?? "",
      medication_notes: pet?.medications ?? "",
      special_instructions: pet?.other_notes ?? "",
    };
  };

  const togglePet = (petId: string) => {
    setForm((f) => ({
      ...f,
      pet_ids: f.pet_ids.includes(petId)
        ? f.pet_ids.filter((id) => id !== petId)
        : [...f.pet_ids, petId],
      pet_care_by_pet_id: f.pet_ids.includes(petId)
        ? Object.fromEntries(
            Object.entries(f.pet_care_by_pet_id).filter(([id]) => id !== petId),
          )
        : {
            ...f.pet_care_by_pet_id,
            [petId]: f.pet_care_by_pet_id[petId] ?? getInitialPetCare(petId),
          },
    }));
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.owner_id || !form.room_id || !form.check_in_date || !form.check_out_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.pet_ids.length === 0) {
      toast.error("Select at least one cat for this stay");
      return;
    }
    const nonCat = form.pet_ids.some(
      (id) => ownerPets.find((p) => p.id === id)?.species !== "cat",
    );
    if (nonCat) {
      toast.error("Only cats can be added to cat boarding rooms");
      return;
    }
    const selectedRoom = catRooms.find((r) => r.id === form.room_id);
    if (!selectedRoom) {
      toast.error("Please select a cat boarding room");
      return;
    }

    const catTransportLabel = transportZoneLabel(form.transport_zone);
    const addons = [
      form.pickup_required && `Pickup (${catTransportLabel})`,
      form.dropoff_required && `Drop-off (${catTransportLabel})`,
      form.addon_groom && "Full Groom on checkout",
      form.addon_bath && "Full Bath on checkout",
    ]
      .filter(Boolean)
      .join(", ");

    if (
      (form.pickup_required || form.dropoff_required) &&
      privateDubaiOverCapacity(form.transport_zone, form.pet_ids.length)
    ) {
      toast.error(
        "Private Dubai transport is capped at 3 pets. Split the group or choose Dubai — Shared.",
      );
      return;
    }

    const catBlock = buildCatPreferencesNote(form);

    const payload: CreateBookingPayload = {
      owner_id: form.owner_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      pet_care_by_pet_id: form.pet_care_by_pet_id,
      notes: [form.notes, catBlock, addons ? `Add-ons: ${addons}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      do_not_move: form.do_not_move,
      pickup_required: form.pickup_required,
      dropoff_required: form.dropoff_required,
      staff_id: form.staff_id || null,
      status: "confirmed",
    };

    createBookingMut.mutate(payload, {
      onSuccess: (booking) => {
        toast.success("Booking created");
        setNewBookingOpen(false);

        const addonItems: { key: string; label: string; quantity?: number }[] = [];
        const catTKey = transportPricingKey(form.transport_zone);
        const catTZone = transportZoneLabel(form.transport_zone);
        const catTQty = transportQuantityForPets(form.transport_zone, form.pet_ids.length);
        const catTSuffix = catTQty > 1 ? ` × ${catTQty} cats` : "";
        if (form.pickup_required) addonItems.push({ key: catTKey, label: `Pickup — ${catTZone}${catTSuffix}`, quantity: catTQty });
        if (form.dropoff_required) addonItems.push({ key: catTKey, label: `Drop-off — ${catTZone}${catTSuffix}`, quantity: catTQty });
        if (form.addon_groom) {
          const line = boardCheckoutGroomingAddon("full_groom");
          if (line) addonItems.push(line);
        }
        if (form.addon_bath) {
          const line = boardCheckoutGroomingAddon("full_bath");
          if (line) addonItems.push(line);
        }

        createBookingInvoice({
          bookingId: booking.id,
          ownerId: form.owner_id,
          serviceType: "boarding",
          roomId: form.room_id,
          roomType: selectedRoom?.room_type ?? "boarding",
          roomName: selectedRoom?.room_number,
          petCount: form.pet_ids.length,
          checkInDate: form.check_in_date,
          checkOutDate: form.check_out_date,
          addons: addonItems,
        }).then(() => {
          toast.success("Draft invoice created");
        }).catch((err) => {
          console.error("Auto-invoice failed:", err);
          toast.error("Invoice not created: " + (err?.message ?? "unknown error"));
        });
      },
      onError: (err) => toast.error(err.message || "Failed to create booking"),
    });
  };

  const renderRoomRow = (roomId: string) => {
    const roomBookings = bookingsByRoom.get(roomId) ?? [];
    const dayBookingMap = new Map<string, { booking: BookingWithDetails; span: number; isFirst: boolean }>();

    roomBookings.forEach((b) => {
      days.forEach((day, idx) => {
        const dayStr = toDateStr(day);
        if (dayStr >= b.check_in_date && dayStr < b.check_out_date) {
          const isFirst = dayStr === b.check_in_date || idx === 0;
          if (isFirst) {
            const endOfWindow = toDateStr(addDays(windowStart, DAYS));
            const chipEnd = b.check_out_date < endOfWindow ? b.check_out_date : endOfWindow;
            const span = differenceInCalendarDays(parseISO(chipEnd), parseISO(dayStr === b.check_in_date ? b.check_in_date : toDateStr(day)));
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
                className={`h-12 border-r border-b border-border cursor-pointer transition-colors ${todayHighlight ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-muted/50"}`}
                onClick={() => openNewBooking(roomId, dayStr)}
              />
            );
          }

          if (!entry.isFirst) {
            return (
              <div
                key={dayStr}
                style={{ minWidth: DAY_COL_W, width: DAY_COL_W }}
                className={`h-12 border-r border-b border-border ${todayHighlight ? "bg-amber-50" : ""}`}
              />
            );
          }

          const { booking, span } = entry;
          const names = booking.booking_pets.map((bp) => bp.pets?.name ?? "").filter(Boolean);
          const label = formatBookingCell(names, booking.owners?.last_name ?? "") || booking.booking_ref || "—";

          return (
            <div
              key={dayStr}
              style={{ minWidth: DAY_COL_W * span - 4, width: DAY_COL_W * span - 4, marginLeft: 2, marginRight: 2 }}
              className={`relative h-10 mt-1 rounded text-xs font-medium px-2 flex items-center gap-1 cursor-pointer truncate z-10 select-none ${STATUS_CLASSES[booking.status]}`}
              onClick={() => setDetailBooking(booking)}
            >
              <span className="truncate min-w-0 flex-1">{label}</span>
              {booking.booking_pets.length > 1 && <span className="shrink-0 opacity-80">+{booking.booking_pets.length - 1}</span>}
              {bookingBelongingsCount(booking) > 0 ? <Luggage className="h-3 w-3 shrink-0 opacity-90" aria-hidden /> : null}
            </div>
          );
        })}
      </div>
    );
  };

  const isLoading = bookingsLoading || roomsLoading;

  return (
    <>
      <main className={`flex flex-col ${suppressToolbar ? "" : "flex-1 overflow-hidden"}`}>
        {!suppressToolbar ? (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => onWindowStartChange((d) => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => onWindowStartChange(startOfWeek(today, { weekStartsOn: 1 }))}>Today</Button>
              <Button variant="outline" size="icon" onClick={() => onWindowStartChange((d) => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
              <span className="ml-2 text-sm font-medium text-foreground">{format(windowStart, "d MMM")} – {format(windowEnd, "d MMM yyyy")}</span>
            </div>
            <Button onClick={() => openNewBooking()}><Plus className="mr-2 h-4 w-4" />New booking</Button>
          </div>
        ) : (
          <div className="flex items-center justify-end px-6 py-2 border-b border-border bg-violet-50/90 shrink-0">
            <Button size="sm" onClick={() => openNewBooking()}><Plus className="mr-2 h-4 w-4" />New cat booking</Button>
          </div>
        )}

        <div className={suppressToolbar ? "" : "flex-1 overflow-auto"}>
          {isLoading ? (
            <div className="p-8 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : catRooms.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">No active cat boarding rooms found. Add rooms with cat wing in Settings &rarr; Rooms.</p>
          ) : (
            <div style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}>
              <div className="flex sticky top-0 z-20 bg-card border-b border-border">
                <div style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }} className="shrink-0 border-r border-border" />
                {days.map((day) => {
                  const todayHighlight = isToday(day);
                  return (
                    <div key={toDateStr(day)} style={{ minWidth: DAY_COL_W, width: DAY_COL_W }} className={`border-r border-border text-center py-2 text-xs font-medium ${todayHighlight ? "bg-amber-100 text-amber-900" : "text-muted-foreground"}`}>
                      <div>{format(day, "EEE")}</div>
                      <div className={`text-sm ${todayHighlight ? "font-bold" : "font-normal"}`}>{format(day, "d")}</div>
                    </div>
                  );
                })}
              </div>

              {CAT_TIER_ORDER.map((tier) => {
                const tierRooms = roomsByTier.get(tier) ?? [];
                if (tierRooms.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="flex sticky left-0 bg-violet-50 border-b border-t border-border" style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}>
                      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-900">{CAT_TIER_LABELS[tier]}</div>
                    </div>
                    {tierRooms.map((room) => (
                      <div key={room.id} className="flex">
                        <div style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }} className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card">
                          <span className="truncate" title={`${room.room_number} — ${room.room_type?.replace(/_/g, " ")} (${room.capacity_type})`}>
                            <span className="font-medium">{room.room_number}</span>
                            <span className="ml-1.5 text-[11px] text-muted-foreground capitalize">{room.room_type?.replace(/_/g, " ")} · {room.capacity_type}</span>
                          </span>
                        </div>
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

      {/* Cat new booking sheet */}
      <Sheet open={newBookingOpen} onOpenChange={setNewBookingOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Cat Booking</SheetTitle>
            <SheetDescription>Cat boarding — only cats are listed below.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateBooking} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Owner <span className="text-destructive">*</span></Label>
              <Popover open={ownerPopOpen} onOpenChange={setOwnerPopOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Input placeholder="Search by name or phone…" value={ownerSearch} onChange={(e) => { setOwnerSearch(e.target.value); setOwnerPopOpen(true); }} onFocus={() => ownerSearch.length >= 2 && setOwnerPopOpen(true)} />
                  </div>
                </PopoverTrigger>
                {ownerResults.length > 0 && (
                  <PopoverContent align="start" className="p-1 w-80">
                    {ownerResults.map((o) => (
                      <button key={o.id} type="button" className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent" onClick={() => { setForm((f) => ({ ...f, owner_id: o.id })); setOwnerSearch(`${ownerDisplayName(o.first_name, o.last_name)} — ${o.phone}`); setOwnerPopOpen(false); }}>
                        <span className="font-medium">{ownerDisplayName(o.first_name, o.last_name)}</span>
                        <span className="ml-2 text-muted-foreground">{o.phone}</span>
                      </button>
                    ))}
                  </PopoverContent>
                )}
              </Popover>
            </div>

            {form.owner_id && (
              <div className="space-y-2">
                <Label>Pets (cats only)</Label>
                {ownerPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pets registered for this owner.</p>
                ) : catPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This owner has no cats — switch to <strong>Dogs</strong> above.</p>
                ) : (
                  <div className="space-y-2">
                    {catPets.map((pet) => (
                      <div key={pet.id} className="flex items-center gap-2">
                        <Checkbox id={`cat-${pet.id}`} checked={form.pet_ids.includes(pet.id)} onCheckedChange={() => togglePet(pet.id)} />
                        <Label htmlFor={`cat-${pet.id}`} className="cursor-pointer font-normal">{pet.name} <span className="ml-1 text-muted-foreground text-xs">(cat)</span></Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {form.pet_ids.length > 0 && (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Per-cat care (prefilled from profile)</Label>
                {form.pet_ids.map((petId) => {
                  const pet = ownerPets.find((p) => p.id === petId);
                  const care = form.pet_care_by_pet_id[petId] ?? getInitialPetCare(petId);
                  return (
                    <div key={petId} className="space-y-2 rounded border p-3">
                      <p className="text-sm font-semibold">{pet?.name ?? "Cat"}</p>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Feeding notes</Label>
                        <Textarea
                          rows={2}
                          value={care.feeding_notes}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, feeding_notes: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Medication notes</Label>
                        <Textarea
                          rows={2}
                          value={care.medication_notes}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, medication_notes: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Special instructions</Label>
                        <Textarea
                          rows={2}
                          value={care.special_instructions}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              pet_care_by_pet_id: {
                                ...f.pet_care_by_pet_id,
                                [petId]: { ...care, special_instructions: e.target.value },
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <Label>Room <span className="text-destructive">*</span></Label>
              <Select value={form.room_id} onValueChange={(v) => setForm((f) => ({ ...f, room_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {CAT_TIER_ORDER.map((tier) => {
                    const tr = roomsByTier.get(tier) ?? [];
                    if (tr.length === 0) return null;
                    return (
                      <div key={tier}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{CAT_TIER_LABELS[tier]}</div>
                        {tr.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.room_number} — <span className="capitalize text-muted-foreground">{r.room_type?.replace(/_/g, " ")} · {r.capacity_type}</span>
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.room_id && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  {catRatePreview.isLoading ? (
                    <p className="text-xs text-muted-foreground">Resolving mapped price...</p>
                  ) : catRatePreview.data ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Resolved nightly price ({catRatePetCount} pet{catRatePetCount !== 1 ? "s" : ""})
                      </p>
                      <p className="text-sm font-medium">
                        {formatAed(catRatePreview.data.unitPrice)} <span className="text-xs text-muted-foreground">({catRatePreview.data.pricingKey})</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Could not resolve mapped price yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.check_in_date} onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Check-out <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.check_out_date} onChange={(e) => setForm((f) => ({ ...f, check_out_date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Transport</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="pickup_cat" checked={form.pickup_required} onCheckedChange={(v) => setForm((f) => ({ ...f, pickup_required: !!v }))} />
                <Label htmlFor="pickup_cat" className="cursor-pointer font-normal">Pickup (to facility)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="dropoff_cat" checked={form.dropoff_required} onCheckedChange={(v) => setForm((f) => ({ ...f, dropoff_required: !!v }))} />
                <Label htmlFor="dropoff_cat" className="cursor-pointer font-normal">Drop-off (after stay)</Label>
              </div>
              {(form.pickup_required || form.dropoff_required) && (
                <div className="space-y-1 pt-1">
                  <Label className="text-xs text-muted-foreground font-normal">Transport option</Label>
                  <Select
                    value={form.transport_zone}
                    onValueChange={(v) => setForm((f) => ({ ...f, transport_zone: v as TransportZone }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_ZONE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {catActiveTransportRate && (() => {
                    const qty = transportQuantityForPets(form.transport_zone, form.pet_ids.length);
                    const over = privateDubaiOverCapacity(form.transport_zone, form.pet_ids.length);
                    const opt = TRANSPORT_ZONE_OPTIONS.find((o) => o.value === form.transport_zone);
                    return (
                      <>
                        <p className="text-xs text-muted-foreground">
                          AED {catActiveTransportRate.amount_aed.toFixed(2)} × {qty}
                          {form.transport_zone === "dubai_private" ? " (flat per trip)" : " per cat"}
                          {opt ? ` — ${opt.helper}` : ""}
                        </p>
                        {over && (
                          <p className="text-xs text-destructive">
                            Private is capped at 3 pets. Switch to Shared or split the group.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">Cat preferences</Label>
              <div className="space-y-2">
                <Label htmlFor="cat_litter" className="text-xs text-muted-foreground font-normal">Litter type</Label>
                <Input id="cat_litter" placeholder="e.g. clumping, wood pellet…" value={form.cat_litter_type} onChange={(e) => setForm((f) => ({ ...f, cat_litter_type: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="cat_indoor" className="cursor-pointer">Indoor only</Label>
                <Switch id="cat_indoor" checked={form.cat_indoor_only} onCheckedChange={(v) => setForm((f) => ({ ...f, cat_indoor_only: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="cat_share" className="cursor-pointer">OK to share with family cats</Label>
                <Switch id="cat_share" checked={form.cat_ok_share_family} onCheckedChange={(v) => setForm((f) => ({ ...f, cat_ok_share_family: v }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat_diet" className="text-xs text-muted-foreground font-normal">Special diet notes</Label>
                <Textarea id="cat_diet" rows={3} placeholder="Feeding restrictions, wet/dry, portions…" value={form.cat_special_diet} onChange={(e) => setForm((f) => ({ ...f, cat_special_diet: e.target.value }))} />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">Add-ons</Label>
              <div className="space-y-2">
                {[
                  { key: "addon_groom", label: "Full Groom on checkout" },
                  { key: "addon_bath", label: "Full Bath on checkout" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox id={`cat_${key}`} checked={form[key as keyof CatBookingForm] as boolean} onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: !!v }))} />
                    <Label htmlFor={`cat_${key}`} className="cursor-pointer font-normal">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="do_not_move_cat" className="cursor-pointer">DO NOT MOVE</Label>
              <Switch id="do_not_move_cat" checked={form.do_not_move} onCheckedChange={(v) => setForm((f) => ({ ...f, do_not_move: v }))} />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Staff name</Label>
              <Input placeholder="Who is creating this booking?" value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))} />
            </div>

            <Button type="submit" className="w-full" disabled={createBookingMut.isPending}>
              {createBookingMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Booking
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Cat detail sheet */}
      <Sheet open={!!detailBooking} onOpenChange={(open) => { if (!open) { setDetailBooking(null); setCheckInSheetOpen(false); setCheckOutSheetOpen(false); setBelongingsReadOnly(false); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailBooking && (
            <>
              <SheetHeader>
                <SheetTitle>{detailBooking.booking_ref ?? "Booking Details"}</SheetTitle>
                <SheetDescription>Reservation overview and actions.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={STATUS_BADGE[detailBooking.status]}>{detailBooking.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
                  {detailBooking.do_not_move && <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">DO NOT MOVE</Badge>}
                </div>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Owner</p>
                  <button type="button" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={() => navigate(`/customers/${detailBooking.owner_id}`)}>
                    {detailBooking.owners?.first_name} {detailBooking.owners?.last_name} <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Pet{detailBooking.booking_pets.length !== 1 ? "s" : ""}</p>
                  {detailBooking.booking_pets.length === 0 ? <p className="text-sm">—</p> : (
                    <p className="text-sm flex flex-wrap gap-x-1 gap-y-0.5">
                      {detailBooking.booking_pets.map((bp, i) => (
                        <span key={bp.pet_id}>
                          {i > 0 ? <span className="text-muted-foreground">, </span> : null}
                          <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/customers/${detailBooking.owner_id}/pets/${bp.pet_id}`)}>{bp.pets?.name ?? "Unknown"}</button>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <BookingProfileNotes ownerOtherNotes={detailBooking.owners?.other_notes} pets={detailBooking.booking_pets.map((bp) => ({ name: bp.pets?.name ?? "Pet", otherNotes: bp.pets?.other_notes }))} />
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Room</p>
                  <p className="text-sm font-medium">{detailBooking.rooms?.room_number ?? detailBooking.rooms?.display_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{detailBooking.rooms?.room_type?.replace(/_/g, " ") ?? ""} · {detailBooking.rooms?.capacity_type ?? ""} · {detailBooking.rooms?.wing?.replace(/_/g, " ") ?? ""}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
                    <p className="text-sm">{format(parseISO(detailBooking.check_in_date), "d MMM yyyy")}</p>
                    {detailBooking.actual_check_in_at && <p className="text-xs text-muted-foreground">Actual: {format(parseISO(detailBooking.actual_check_in_at), "d MMM HH:mm")}</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
                    <p className="text-sm">{format(parseISO(detailBooking.check_out_date), "d MMM yyyy")}</p>
                    {detailBooking.actual_check_out_at && <p className="text-xs text-muted-foreground">Actual: {format(parseISO(detailBooking.actual_check_out_at), "d MMM HH:mm")}</p>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date)} night{nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date) !== 1 ? "s" : ""}</p>
                {detailBooking.notes && <div className="space-y-1"><p className="text-xs uppercase text-muted-foreground font-medium">Notes</p><p className="text-sm whitespace-pre-line">{detailBooking.notes}</p></div>}
                <Separator />
                <div className="space-y-3">
                  <Button variant="outline" className="w-full" onClick={() => void printKennelCard(detailBooking)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Kennel Card
                  </Button>
                  {detailBooking.status === "confirmed" && <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setBelongingsReadOnly(false); setCheckInSheetOpen(true); }}>Check In</Button>}
                  {detailBooking.status === "checked_in" && (
                    <div className="flex flex-col gap-2">
                      <Button className="w-full" variant="outline" onClick={() => setCheckOutSheetOpen(true)}>Check Out</Button>
                      <Button type="button" variant="outline" className="w-full" onClick={() => { setBelongingsReadOnly(true); setCheckInSheetOpen(true); }}><Eye className="mr-2 h-4 w-4" />View Belongings</Button>
                    </div>
                  )}
                  {(detailBooking.status === "confirmed" || detailBooking.status === "enquiry") && (
                    <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10" disabled={updateBooking.isPending} onClick={() => updateBooking.mutate({ id: detailBooking.id, status: "cancelled" }, { onSuccess: () => { toast.success("Booking cancelled"); setDetailBooking(null); }, onError: (err) => toast.error(err.message) })}>
                      {updateBooking.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Cancel Booking
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
          <CheckInSheet open={checkInSheetOpen} onOpenChange={(o) => { if (!o) { setCheckInSheetOpen(false); setBelongingsReadOnly(false); } }} bookingId={detailBooking.id} ownerName={`${detailBooking.owners?.first_name ?? ""} ${detailBooking.owners?.last_name ?? ""}`.trim()} petNames={detailBooking.booking_pets.map((bp) => bp.pets?.name).filter(Boolean).join(", ")} roomName={detailBooking.rooms?.display_name ?? "—"} bookedCheckInDate={detailBooking.check_in_date} bookedCheckOutDate={detailBooking.check_out_date} readOnly={belongingsReadOnly} onFinished={handleBelongingsFlowFinished} />
          <CheckOutSheet open={checkOutSheetOpen} onOpenChange={(o) => { if (!o) setCheckOutSheetOpen(false); }} bookingId={detailBooking.id} ownerName={`${detailBooking.owners?.first_name ?? ""} ${detailBooking.owners?.last_name ?? ""}`.trim()} petNames={detailBooking.booking_pets.map((bp) => bp.pets?.name).filter(Boolean).join(", ")} roomName={detailBooking.rooms?.display_name ?? "—"} checkInDate={detailBooking.check_in_date} checkOutDate={detailBooking.check_out_date} onFinished={handleBelongingsFlowFinished} />
        </>
      )}
    </>
  );
}

// ─── hub page ────────────────────────────────────────────────────────────────

type Species = "dog" | "cat";
type BoardingListPreset = "today" | "tomorrow" | "next7";

function BoardingOperationsList({ species }: { species: Species }) {
  const [datePreset, setDatePreset] = useState<BoardingListPreset>("today");
  const [anchorDate, setAnchorDate] = useState(toDateStr(new Date()));

  const rangeStart = useMemo(
    () => (datePreset === "tomorrow" ? toDateStr(addDays(parseISO(anchorDate), 1)) : anchorDate),
    [datePreset, anchorDate],
  );
  const rangeEnd = useMemo(
    () => (datePreset === "next7" ? toDateStr(addDays(parseISO(rangeStart), 6)) : rangeStart),
    [datePreset, rangeStart],
  );

  const { data: bookings = [], isLoading } = useBookings(rangeStart, rangeEnd);

  const filtered = useMemo(() => {
    const rows = bookings.filter((b) => {
      const isCatRoom = b.rooms?.wing === "cattery";
      if (species === "cat") return isCatRoom;
      return !isCatRoom;
    });

    return rows.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
  }, [bookings, species]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={datePreset === "today" ? "default" : "outline"} size="sm" onClick={() => setDatePreset("today")}>Today</Button>
        <Button variant={datePreset === "tomorrow" ? "default" : "outline"} size="sm" onClick={() => setDatePreset("tomorrow")}>Tomorrow</Button>
        <Button variant={datePreset === "next7" ? "default" : "outline"} size="sm" onClick={() => setDatePreset("next7")}>Next 7 days</Button>
        <Input
          type="date"
          value={anchorDate}
          onChange={(e) => {
            setAnchorDate(e.target.value);
            setDatePreset("today");
          }}
          className="w-44"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => void printKennelCards(filtered, `Kennel Cards ${species} ${rangeStart}${rangeEnd !== rangeStart ? ` to ${rangeEnd}` : ""}`)}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Print full list
        </Button>
      </div>

      <div className="rounded-lg border">
        {isLoading ? (
          <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">No boarding records for this range.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((booking) => {
              const tags = buildBoardingTags({
                status: booking.status,
                checkInDate: booking.check_in_date,
                checkOutDate: booking.check_out_date,
                todayDate: toDateStr(new Date()),
              });
              const petNames = booking.booking_pets.map((bp) => bp.pets?.name).filter(Boolean).join(", ") || "—";
              const owner = ownerDisplayName(booking.owners?.first_name, booking.owners?.last_name);
              return (
                <div key={booking.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{petNames} - {owner}</p>
                    <p className="text-xs text-muted-foreground">
                      {booking.rooms?.display_name ?? "—"} - {booking.check_in_date} to {booking.check_out_date}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <Badge key={`${booking.id}-${tag.key}`} variant="outline" className={tagToneClass(tag.tone)}>
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void printKennelCard(booking)}>
                    <Printer className="mr-1.5 h-4 w-4" />
                    Kennel card
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardingHubPage() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const location = useLocation();

  const initialSpecies: Species =
    location.hash === `#${CAT_BOARDING_SECTION_ID}` ? "cat" : "dog";
  const [species, setSpecies] = useState<Species>(initialSpecies);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

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
          {viewMode === "calendar" && (
            <>
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
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => setViewMode("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => setViewMode("list")}
            >
              Operations list
            </button>
          </div>

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
        {viewMode === "calendar" ? (
          species === "dog" ? (
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
          )
        ) : (
          <BoardingOperationsList species={species} />
        )}
      </div>
    </div>
  );
}

export default BoardingHubPage;
