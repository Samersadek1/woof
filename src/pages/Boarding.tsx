import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  addDays,
  startOfWeek,
  differenceInCalendarDays,
  isToday,
  parseISO,
  eachDayOfInterval,
} from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import {
  useBookings,
  useRooms,
  useCreateBooking,
  useUpdateBooking,
  isAssessmentRequiredError,
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
import { resolveBoardingRate } from "@/lib/boardingPricing";
import { grandTotalFromNet, vatAmountFromNet, vatLineLabel } from "@/lib/vatConfig";
import {
  BOARDING_TRANSPORT_REGION_OPTIONS,
  TRANSPORT_PRICING_KEYS,
  TRANSPORT_ZONE_OPTIONS,
  boardingTransportFreePromoFromRegion,
  parseBoardingTransportAed,
  regionToTransportZone,
  transportRegionLabel,
  type BoardingTransportRegion,
  type TransportZone,
  privateDubaiOverCapacity,
  transportPricingKey,
  transportQuantityForPets,
} from "@/lib/transportPricing";
import { buildBoardingTags, tagToneClass } from "@/lib/operationsTags";
import { getBookingRoomOverlapErrorMessage } from "@/lib/bookingAvailabilityErrors";
import { DEFAULT_DOG_SIZE, type DogSizeFormValue } from "@/lib/dogSizeForm";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  ExternalLink,
  Eye,
  Luggage,
  Printer,
  TriangleAlert,
} from "lucide-react";
import { PetSpecialAlertsBanner } from "@/components/PetSpecialAlertsBanner";
import { DogSizeField } from "@/components/DogSizeField";
import { bookingAnyPetHasAlerts, parsePetSpecialAlerts, petHasSpecialAlerts } from "@/lib/petAlerts";
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

function showCreateBookingErrorToast(options: {
  err: unknown;
  navigate: ReturnType<typeof useNavigate>;
  ownerId: string;
  petId?: string;
  petName?: string;
}) {
  const { err, navigate, ownerId, petId, petName } = options;
  const overlapMessage = getBookingRoomOverlapErrorMessage(err);
  if (overlapMessage) {
    toast.error(overlapMessage);
    return;
  }

  if (!isAssessmentRequiredError(err)) {
    const genericMessage = err instanceof Error ? err.message : "Failed to create booking";
    toast.error(genericMessage);
    return;
  }

  const detail = err instanceof Error ? err.message : "";
  toast.error(`${petName ?? "This pet"} hasn't completed a behavioural assessment yet.`, {
    description: detail,
    action: petId
      ? {
          label: "Schedule Assessment",
          onClick: () =>
            navigate(`/customers/${ownerId}/pets/${petId}?schedule_assessment=1`),
        }
      : undefined,
  });
}

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
  bond_rooms: "Bond Rooms",
  dluxe: "Dluxe",
  standard_room: "Standard Room",
};

const WING_ORDER: RoomWing[] = [
  "bond_rooms",
  "oxford",
  "piccadilly",
  "park_lane",
  "fleet",
  "back_kennels",
  "dluxe",
  "standard_room",
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

function BoardingTransportRateHint({
  activeRate,
  zone,
  petCount,
  pickup,
  dropoff,
  promo,
  petNoun,
  freeOfCharge,
}: {
  activeRate?: { amount_aed: number };
  zone: TransportZone;
  petCount: number;
  pickup: boolean;
  dropoff: boolean;
  promo: ReturnType<typeof boardingTransportFreePromoFromRegion>;
  petNoun: "dog" | "cat";
  /** Staff override: transport included at no cost (in addition to stay-length promos). */
  freeOfCharge?: boolean;
}) {
  if (!pickup && !dropoff) return null;
  const over = privateDubaiOverCapacity(zone, petCount);
  const capGroup = petNoun === "dog" ? "dogs" : "pets";
  const showFree = promo.applies || !!freeOfCharge;
  const freeBadge = (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800 shrink-0">
      Free
    </Badge>
  );
  if (showFree) {
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {pickup && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Pickup (one-way)</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-emerald-700">Free</span>
                {freeBadge}
              </span>
            </div>
          )}
          {dropoff && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Drop-off (one-way)</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-emerald-700">Free</span>
                {freeBadge}
              </span>
            </div>
          )}
        </div>
        {over && (
          <p className="text-xs text-destructive">
            Private is capped at 3 {capGroup}. Split the group or choose Dubai — Shared.
          </p>
        )}
      </div>
    );
  }
  if (!activeRate) return null;
  const qty = transportQuantityForPets(zone, Math.max(1, petCount));
  const opt = TRANSPORT_ZONE_OPTIONS.find((o) => o.value === zone);
  return (
    <>
      <p className="text-xs text-muted-foreground">
        AED {activeRate.amount_aed.toFixed(2)} × {qty}
        {zone === "dubai_private" ? " (flat per trip)" : ` per ${petNoun}`}
        {opt ? ` — ${opt.helper}` : ""}
      </p>
      {over && (
        <p className="text-xs text-destructive">
          Private is capped at 3 {capGroup}. Split the group or choose Dubai — Shared.
        </p>
      )}
    </>
  );
}

/** Invoice line keys — optional manual staff prices per booking (`unitPriceAed` on invoice). */
type BoardingAddonSpecies = "dog" | "cat";
type BoardingAddonOption = {
  id: string;
  label: string;
  pricingKey: string;
  species: BoardingAddonSpecies[];
};

const BOARDING_GROOMING_ADDONS: BoardingAddonOption[] = [
  {
    id: "full_groom_checkout",
    label: "Full Groom on checkout",
    pricingKey: "boarding_addon_full_groom_checkout",
    species: ["dog"],
  },
  {
    id: "bath_only",
    label: "Bath only",
    pricingKey: "boarding_addon_bath_only",
    species: ["dog", "cat"],
  },
  {
    id: "full_bath",
    label: "Full Bath",
    pricingKey: "boarding_addon_full_bath",
    species: ["dog", "cat"],
  },
  {
    id: "blow_dry",
    label: "Blow dry",
    pricingKey: "boarding_addon_blow_dry",
    species: ["dog", "cat"],
  },
  {
    id: "fur_brushing",
    label: "Fur brushing",
    pricingKey: "boarding_addon_fur_brushing",
    species: ["dog", "cat"],
  },
  {
    id: "ear_cleaning",
    label: "Ear Cleaning",
    pricingKey: "boarding_addon_ear_cleaning",
    species: ["dog", "cat"],
  },
  {
    id: "teeth_brushing",
    label: "Teeth brushing",
    pricingKey: "boarding_addon_teeth_brushing",
    species: ["dog"],
  },
  {
    id: "nail_clipping",
    label: "Nail clipping",
    pricingKey: "boarding_addon_nail_clipping",
    species: ["dog", "cat"],
  },
  {
    id: "pawdicure",
    label: "Pawdicure",
    pricingKey: "boarding_addon_pawdicure",
    species: ["dog"],
  },
  {
    id: "paw_wash",
    label: "Paw wash",
    pricingKey: "boarding_addon_paw_wash",
    species: ["dog", "cat"],
  },
  {
    id: "malaseb_bath",
    label: "Malaseb bath",
    pricingKey: "boarding_addon_malaseb_bath",
    species: ["dog"],
  },
  {
    id: "body_trimming",
    label: "Body trimming",
    pricingKey: "boarding_addon_body_trimming",
    species: ["dog"],
  },
  {
    id: "anal_gland_expression",
    label: "Anal Gland Expression",
    pricingKey: "boarding_addon_anal_gland_expression",
    species: ["dog"],
  },
  {
    id: "de_shedding",
    label: "De-shedding",
    pricingKey: "boarding_addon_de_shedding",
    species: ["dog"],
  },
  {
    id: "de_matting",
    label: "De-matting",
    pricingKey: "boarding_addon_de_matting",
    species: ["dog", "cat"],
  },
];

function parseManualAedInput(raw: string): number | null {
  const n = parseFloat(raw.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function addonOptionsForSpecies(species: BoardingAddonSpecies): BoardingAddonOption[] {
  return BOARDING_GROOMING_ADDONS.filter((addon) => addon.species.includes(species));
}

function selectedAddonEntries(
  addonEnabled: Record<string, boolean>,
  addonPriceAed: Record<string, string>,
  species: BoardingAddonSpecies,
): Array<{ addon: BoardingAddonOption; amount: number }> {
  return addonOptionsForSpecies(species)
    .map((addon) => {
      if (!addonEnabled[addon.id]) return null;
      const amount = parseManualAedInput(addonPriceAed[addon.id] ?? "0");
      if (amount == null || amount <= 0) return null;
      return { addon, amount };
    })
    .filter((entry): entry is { addon: BoardingAddonOption; amount: number } => !!entry);
}

function petSizeHintForBoarding(pet: {
  name: string | null;
  species: string | null;
  size: string | null;
}): string {
  if (pet.species === "cat") return "Cat";
  return pet.size ? `Dog · ${pet.size}` : "Dog · ?";
}

function selectedPetsSizeSummary(
  ownerPets: { id: string; name: string | null; species: string | null; size: string | null }[],
  petIds: string[],
): string {
  if (petIds.length === 0) return "";
  return petIds
    .map((id) => {
      const p = ownerPets.find((x) => x.id === id);
      if (!p) return null;
      return `${p.name ?? "Pet"} (${petSizeHintForBoarding(p)})`;
    })
    .filter(Boolean)
    .join(", ");
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
        ${special ? `<div class="sub">Special instructions: ${escapeHtml(special)}</div>` : `<div class="sub">Special instructions: —</div>`}
        ${petNote ? `<div class="sub">Profile note: ${escapeHtml(petNote)}</div>` : `<div class="sub">Profile note: —</div>`}
      </li>`;
    })
    .join("");
  const petChecklistCards = booking.booking_pets
    .map((bp) => {
      const petName = bp.pets?.name ?? "Unknown pet";
      const feeding = (bp.feeding_notes ?? bp.pets?.feeding_instructions ?? "").trim() || "—";
      const medication = (bp.medication_notes ?? bp.pets?.medications ?? "").trim() || "—";
      const special = (bp.special_instructions ?? "").trim() || "—";
      return `<div class="pet-check">
        <div class="pet-check-title">${escapeHtml(petName)}</div>
        <div class="row-checks">
          <div class="check-item"><span class="checkbox"></span> Feeding AM</div>
          <div class="check-item"><span class="checkbox"></span> Feeding PM</div>
          <div class="check-item"><span class="checkbox"></span> Medication AM</div>
          <div class="check-item"><span class="checkbox"></span> Medication PM</div>
          <div class="check-item"><span class="checkbox"></span> Walk / Potty</div>
          <div class="check-item"><span class="checkbox"></span> Water refill</div>
        </div>
        <div class="inst"><span class="inst-label">Feeding instructions:</span> ${escapeHtml(feeding)}</div>
        <div class="inst"><span class="inst-label">Medication instructions:</span> ${escapeHtml(medication)}</div>
        <div class="inst"><span class="inst-label">Special instructions:</span> ${escapeHtml(special)}</div>
      </div>`;
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
  const createdByFromNotes =
    booking.notes
      ?.split("\n")
      .find((line) => line.trim().toLowerCase().startsWith("created by:"))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim() || null;
  const createdBy = createdByFromNotes || booking.staff_id || "—";

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

      <div class="label">Belongings checklist</div>
      <div class="row-checks">
        <div class="check-item"><span class="checkbox"></span> Food</div>
        <div class="check-item"><span class="checkbox"></span> Medication pack</div>
        <div class="check-item"><span class="checkbox"></span> Leash / Harness</div>
        <div class="check-item"><span class="checkbox"></span> Toy</div>
        <div class="check-item"><span class="checkbox"></span> Bed / Blanket</div>
        <div class="check-item"><span class="checkbox"></span> Other items</div>
      </div>

      <div class="grid">
        <div><div class="label">Do Not Move</div><div class="value">${booking.do_not_move ? "Yes" : "No"}</div></div>
        <div><div class="label">Created by</div><div class="value">${escapeHtml(createdBy)}</div></div>
      </div>

      <div class="label">Care task boxes</div>
      <div class="care-grid">
        ${petChecklistCards || '<div class="value">—</div>'}
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
    .care-grid { display: grid; gap: 8px; margin-top: 6px; }
    .pet-check { border: 1px solid #222; border-radius: 8px; padding: 8px; }
    .pet-check-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    .row-checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; margin-top: 4px; }
    .check-item { font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .checkbox { width: 12px; height: 12px; border: 1.5px solid #222; display: inline-block; border-radius: 2px; }
    .inst { font-size: 12px; margin-top: 3px; }
    .inst-label { font-weight: 600; }
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

const BOARDING_OPERATIONS_PRINT_TIME = "12:00 PM (My Second Home DIP-2)";

async function hydrateBookingsForComingGoingPrint(
  bookings: BookingWithDetails[],
): Promise<BookingWithDetails[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, breed, other_notes, feeding_instructions, medications))",
    )
    .in("id", ids);

  if (error || !data) return bookings;
  const byId = new Map<string, BookingWithDetails>();
  for (const row of data as unknown as BookingWithDetails[]) byId.set(row.id, row);
  return bookings.map((b) => byId.get(b.id) ?? b);
}

function sortBookingsByRef(a: BookingWithDetails, b: BookingWithDetails): number {
  return (a.booking_ref ?? a.id).localeCompare(b.booking_ref ?? b.id);
}

function boardingOperationsBoardingType(booking: BookingWithDetails): string {
  const r = booking.rooms;
  if (!r) return "—";
  const dn = r.display_name?.trim();
  if (dn) return dn;
  return r.room_type.replace(/_/g, " ");
}

function boardingOperationsKennelCell(booking: BookingWithDetails): string {
  const n = booking.rooms?.room_number?.trim();
  return n ?? "";
}

function boardingOperationsPetsCell(booking: BookingWithDetails): string {
  return booking.booking_pets
    .map((bp) => {
      const p = bp.pets as { name?: string | null; breed?: string | null } | null;
      const name = p?.name?.trim() || "Pet";
      const breed = p?.breed?.trim() || "—";
      return `${name} - ${breed}`;
    })
    .join(", ");
}

/** Operations list “Print full list” — Boarding coming & going report (A4-friendly). */
async function printBoardingComingGoingList(
  filtered: BookingWithDetails[],
  rangeStart: string,
  rangeEnd: string,
  focus: "all" | "check-ins" | "check-outs",
) {
  if (filtered.length === 0) return;
  const hydrated = await hydrateBookingsForComingGoingPrint(filtered);

  const rangeLabel = `${format(parseISO(rangeStart), "MMM d, yyyy")} to ${format(parseISO(rangeEnd), "MMM d, yyyy")}`;
  const docTitle = `Boarding Coming and Going - ${rangeLabel}`;

  const days = eachDayOfInterval({
    start: parseISO(rangeStart),
    end: parseISO(rangeEnd),
  }).map((d) => toDateStr(d));

  const tableHead = `<thead><tr>
    <th>Time</th>
    <th>Type</th>
    <th>Boarding ID</th>
    <th>Owner</th>
    <th>Boarding Type(s)</th>
    <th>Kennels</th>
    <th>Pets</th>
  </tr></thead>`;

  let bodySections = "";
  for (const day of days) {
    const arrivals =
      focus === "check-outs"
        ? []
        : hydrated.filter((b) => b.check_in_date === day).sort(sortBookingsByRef);
    const departures =
      focus === "check-ins"
        ? []
        : hydrated.filter((b) => b.check_out_date === day).sort(sortBookingsByRef);

    if (arrivals.length === 0 && departures.length === 0) continue;

    const daySubheader = format(parseISO(`${day}T12:00:00`), "EEEE, MMMM d, yyyy");
    let rowsHtml = "";
    for (const b of arrivals) {
      rowsHtml += `<tr>
        <td>${escapeHtml(BOARDING_OPERATIONS_PRINT_TIME)}</td>
        <td>Arrival</td>
        <td>${escapeHtml(b.booking_ref ?? b.id.slice(0, 8))}</td>
        <td>${escapeHtml(ownerDisplayName(b.owners?.first_name, b.owners?.last_name))}</td>
        <td>${escapeHtml(boardingOperationsBoardingType(b))}</td>
        <td>${escapeHtml(boardingOperationsKennelCell(b))}</td>
        <td>${escapeHtml(boardingOperationsPetsCell(b))}</td>
      </tr>`;
    }
    for (const b of departures) {
      rowsHtml += `<tr>
        <td>${escapeHtml(BOARDING_OPERATIONS_PRINT_TIME)}</td>
        <td>Departure</td>
        <td>${escapeHtml(b.booking_ref ?? b.id.slice(0, 8))}</td>
        <td>${escapeHtml(ownerDisplayName(b.owners?.first_name, b.owners?.last_name))}</td>
        <td>${escapeHtml(boardingOperationsBoardingType(b))}</td>
        <td>${escapeHtml(boardingOperationsKennelCell(b))}</td>
        <td>${escapeHtml(boardingOperationsPetsCell(b))}</td>
      </tr>`;
    }

    bodySections += `<section class="day-section">
      <h2 class="day-sub">${escapeHtml(daySubheader)}</h2>
      <table class="report">${tableHead}<tbody>${rowsHtml}</tbody></table>
    </section>`;
  }

  if (!bodySections) {
    bodySections = `<p class="empty">No arrivals or departures in this range for the current filters.</p>`;
  }

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(docTitle)}</title><style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 12mm 10mm 18mm 10mm;
    }
    h1 {
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      margin: 0 0 8px;
      color: #000;
    }
    .day-sub {
      font-size: 12pt;
      font-weight: 600;
      margin: 14px 0 8px;
      color: #000;
    }
    .day-section:first-child .day-sub { margin-top: 6px; }
    table.report {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      color: #000;
      background: #fff;
    }
    table.report th,
    table.report td {
      border: 1px solid #000;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    table.report th {
      font-weight: 700;
      background: #fff;
      text-align: left;
    }
    table.report td:nth-child(1) { width: 14%; }
    table.report td:nth-child(2) { width: 9%; }
    table.report td:nth-child(3) { width: 11%; }
    table.report td:nth-child(4) { width: 14%; }
    table.report td:nth-child(5) { width: 22%; }
    table.report td:nth-child(6) { width: 12%; }
    table.report td:nth-child(7) { width: 18%; }
    .empty { font-size: 11pt; margin-top: 12px; }
    @page {
      size: A4;
      margin: 12mm 10mm 16mm 10mm;
      @bottom-center {
        content: "Page " counter(page);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10pt;
        color: #000;
      }
    }
    @media print {
      body { padding: 0; }
      table.report { font-size: 10pt; }
      table.report th, table.report td { padding: 4px 5px; }
    }
  </style></head><body>
    <h1>${escapeHtml(docTitle)}</h1>
    ${bodySections}
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ─── initial form state ───────────────────────────────────────────────────────
type NewBookingForm = {
  owner_id: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  pet_ids: string[];
  notes: string;
  staff_name: string;
  do_not_move: boolean;
  pickup_required: boolean;
  dropoff_required: boolean;
  /** When true, pickup/drop-off legs are not billed (staff-granted free transport). */
  transport_free_of_charge: boolean;
  transport_region: BoardingTransportRegion;
  /** Per-leg AED totals (Pickup / Drop-off) shown next to checkboxes. */
  transport_pickup_price_aed: string;
  transport_dropoff_price_aed: string;
  /** Boarding grooming add-ons keyed by addon id. */
  addon_enabled: Record<string, boolean>;
  /** Staff-editable AED amounts per add-on (string for controlled inputs). */
  addon_price_aed: Record<string, string>;
  room_rate_type: "peak" | "off_peak";
  pet_care_by_pet_id: Record<
    string,
    {
      feeding_notes: string;
      medication_notes: string;
      special_instructions: string;
    }
  >;
  /** Client-selected size (Small / Medium / Large / Extra Large). */
  dog_size: DogSizeFormValue;
};

const BLANK_FORM: NewBookingForm = {
  owner_id: "",
  room_id: "",
  check_in_date: "",
  check_out_date: "",
  pet_ids: [],
  notes: "",
  staff_name: "",
  do_not_move: false,
  pickup_required: false,
  dropoff_required: false,
  transport_free_of_charge: false,
  transport_region: "dubai",
  transport_pickup_price_aed: "",
  transport_dropoff_price_aed: "",
  addon_enabled: {},
  addon_price_aed: {},
  room_rate_type: "off_peak",
  pet_care_by_pet_id: {},
  dog_size: DEFAULT_DOG_SIZE,
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

  const resolvedDogTransportZone = useMemo(
    () => regionToTransportZone(form.transport_region),
    [form.transport_region],
  );

  const activeTransportRate = transportRates.find(
    (r) => r.key === transportPricingKey(resolvedDogTransportZone),
  );
  const dogRatePetCount = Math.max(1, form.pet_ids.length);
  const dogNights = nightsBetween(form.check_in_date, form.check_out_date);
  const dogTransportPromo = useMemo(
    () => boardingTransportFreePromoFromRegion(dogNights, form.transport_region),
    [dogNights, form.transport_region],
  );
  const dogSuggestedTripTransportAed = useMemo(() => {
    if (!activeTransportRate) return 0;
    const qty = transportQuantityForPets(
      resolvedDogTransportZone,
      Math.max(1, form.pet_ids.length),
    );
    return activeTransportRate.amount_aed * qty;
  }, [activeTransportRate, resolvedDogTransportZone, form.pet_ids.length]);

  const dogRatePreview = useQuery({
    queryKey: [
      "boarding_rate_preview",
      "dog",
      form.room_id,
      dogRatePetCount,
      form.check_in_date,
      form.check_out_date,
      form.room_rate_type,
    ],
    enabled: !!form.room_id,
    queryFn: async () =>
      resolveBoardingRate(form.room_id, dogRatePetCount, {
        checkInDate: form.check_in_date || null,
        checkOutDate: form.check_out_date || null,
        rateType: form.room_rate_type,
      }),
  });

  const dogTransportEstimate = useMemo(() => {
    if (!form.pickup_required && !form.dropoff_required) return 0;
    if (dogTransportPromo.applies || form.transport_free_of_charge) return 0;
    let sum = 0;
    if (form.pickup_required) {
      sum += parseBoardingTransportAed(form.transport_pickup_price_aed);
    }
    if (form.dropoff_required) {
      sum += parseBoardingTransportAed(form.transport_dropoff_price_aed);
    }
    return sum;
  }, [
    dogTransportPromo.applies,
    form.pickup_required,
    form.dropoff_required,
    form.transport_free_of_charge,
    form.transport_pickup_price_aed,
    form.transport_dropoff_price_aed,
  ]);

  useEffect(() => {
    if (!newBookingOpen) return;
    if (dogTransportPromo.applies || form.transport_free_of_charge) {
      setForm((f) => ({
        ...f,
        transport_pickup_price_aed: "0",
        transport_dropoff_price_aed: "0",
      }));
      return;
    }
    const s =
      dogSuggestedTripTransportAed > 0
        ? dogSuggestedTripTransportAed.toFixed(2)
        : "";
    setForm((f) => ({
      ...f,
      transport_pickup_price_aed: s,
      transport_dropoff_price_aed: s,
    }));
  }, [
    newBookingOpen,
    form.transport_region,
    dogSuggestedTripTransportAed,
    dogTransportPromo.applies,
    form.transport_free_of_charge,
  ]);

  useEffect(() => {
    if (!newBookingOpen) return;
    if (!form.pickup_required && !form.dropoff_required && form.transport_free_of_charge) {
      setForm((f) => ({ ...f, transport_free_of_charge: false }));
    }
  }, [newBookingOpen, form.pickup_required, form.dropoff_required, form.transport_free_of_charge]);

  const selectedDogSpecies = useMemo<BoardingAddonSpecies>(() => {
    const hasCat = form.pet_ids.some((id) => ownerPets.find((p) => p.id === id)?.species === "cat");
    return hasCat ? "cat" : "dog";
  }, [form.pet_ids, ownerPets]);

  const visibleDogAddonOptions = useMemo(
    () => addonOptionsForSpecies(selectedDogSpecies),
    [selectedDogSpecies],
  );

  const selectedDogAddons = useMemo(
    () =>
      selectedAddonEntries(
        form.addon_enabled,
        form.addon_price_aed,
        selectedDogSpecies,
      ),
    [form.addon_enabled, form.addon_price_aed, selectedDogSpecies],
  );

  const dogManualAddonTotal = useMemo(
    () => selectedDogAddons.reduce((sum, row) => sum + row.amount, 0),
    [selectedDogAddons],
  );

  const dogBookingEstimateTotal = useMemo(() => {
    let total = 0;
    if (dogRatePreview.data && dogNights > 0) {
      total += dogRatePreview.data.unitPrice * dogNights;
    }
    total += dogTransportEstimate;
    total += dogManualAddonTotal;
    return total;
  }, [
    dogRatePreview.data,
    dogNights,
    dogTransportEstimate,
    dogManualAddonTotal,
  ]);

  const dogBookingVatEstimate = useMemo(
    () => vatAmountFromNet(dogBookingEstimateTotal),
    [dogBookingEstimateTotal],
  );
  const dogBookingGrossEstimate = useMemo(
    () => grandTotalFromNet(dogBookingEstimateTotal),
    [dogBookingEstimateTotal],
  );

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

    const petAddonHintForNotes = selectedPetsSizeSummary(ownerPets, form.pet_ids);
    const transportLabel = transportRegionLabel(form.transport_region);
    const transportComplimentary = dogTransportPromo.applies || form.transport_free_of_charge;
    const selectedAddonsForInvoice = selectedAddonEntries(
      form.addon_enabled,
      form.addon_price_aed,
      selectedDogSpecies,
    );
    const addons = [
      form.pickup_required &&
        `Pickup (${transportLabel})${transportComplimentary ? " — Free" : ""}`,
      form.dropoff_required &&
        `Drop-off (${transportLabel})${transportComplimentary ? " — Free" : ""}`,
      ...selectedAddonsForInvoice.map(
        ({ addon, amount }) =>
          `${addon.label} (${formatAed(amount)}${petAddonHintForNotes ? ` · ${petAddonHintForNotes}` : ""})`,
      ),
    ]
      .filter(Boolean)
      .join(", ");

    const payload: CreateBookingPayload = {
      owner_id: form.owner_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      pet_care_by_pet_id: form.pet_care_by_pet_id,
      notes: [
        form.notes,
        form.staff_name.trim() ? `Created by: ${form.staff_name.trim()}` : "",
        `Rate type: ${form.room_rate_type === "off_peak" ? "Off-peak" : "Peak"}`,
        addons ? `Add-ons: ${addons}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      do_not_move: form.do_not_move,
      pickup_required: form.pickup_required,
      dropoff_required: form.dropoff_required,
      staff_id: null,
      status: "confirmed",
      booking_type: "boarding",
      dog_size: form.dog_size,
    };

    createBooking.mutate(payload, {
      onSuccess: (booking) => {
        toast.success("Booking created");
        setNewBookingOpen(false);

        const addonItems: {
          key: string;
          label: string;
          quantity?: number;
          unitPriceAed?: number;
        }[] = [];
        const tKey = transportPricingKey(resolvedDogTransportZone);
        const tZone = transportRegionLabel(form.transport_region);
        const tQty = transportQuantityForPets(resolvedDogTransportZone, form.pet_ids.length);
        const tSuffix = tQty > 1 ? ` × ${tQty} dogs` : "";
        const tComplimentary = dogTransportPromo.applies || form.transport_free_of_charge;
        if (form.pickup_required) {
          const pickupTotal = tComplimentary
            ? 0
            : parseBoardingTransportAed(form.transport_pickup_price_aed);
          addonItems.push({
            key: tKey,
            label: `Pickup — ${tZone}${tSuffix}${tComplimentary ? " (complimentary)" : ""}`,
            quantity: 1,
            unitPriceAed: pickupTotal,
          });
        }
        if (form.dropoff_required) {
          const dropTotal = tComplimentary
            ? 0
            : parseBoardingTransportAed(form.transport_dropoff_price_aed);
          addonItems.push({
            key: tKey,
            label: `Drop-off — ${tZone}${tSuffix}${tComplimentary ? " (complimentary)" : ""}`,
            quantity: 1,
            unitPriceAed: dropTotal,
          });
        }
        const dogSizeHint = selectedPetsSizeSummary(ownerPets, form.pet_ids);
        for (const { addon, amount } of selectedAddonsForInvoice) {
          addonItems.push({
            key: addon.pricingKey,
            label: dogSizeHint ? `${addon.label} — ${dogSizeHint}` : addon.label,
            quantity: 1,
            unitPriceAed: amount,
          });
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
          roomRateType: form.room_rate_type,
          addons: addonItems,
        }).then(() => {
          toast.success("Draft invoice created");
        }).catch((err) => {
          console.error("Auto-invoice failed:", err);
          toast.error("Invoice not created: " + (err?.message ?? "unknown error"));
        });
      },
      onError: (err) =>
        showCreateBookingErrorToast({
          err,
          navigate,
          ownerId: form.owner_id,
          petId: form.pet_ids[0],
          petName: ownerPets.find((p) => p.id === form.pet_ids[0])?.name,
        }),
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
              {bookingAnyPetHasAlerts(booking) ? (
                <TriangleAlert
                  className="h-3.5 w-3.5 shrink-0 text-orange-100 drop-shadow-sm"
                  aria-label="Pet alert"
                />
              ) : null}
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
                  <PopoverContent align="start" className="p-1 w-80 z-[120] pointer-events-auto">
                    {ownerResults.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent"
                        onClick={() => {
                          // #region agent log
                          fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'post-fix',hypothesisId:'H6',location:'src/pages/Boarding.tsx:newBookingOwnerSelect',message:'boarding owner selected from popover',data:{ownerId:o.id},timestamp:Date.now()})}).catch(()=>{});
                          // #endregion
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
                        <Label
                          htmlFor={`pet-${pet.id}`}
                          className="cursor-pointer font-normal flex-1 flex flex-wrap items-center gap-2"
                        >
                          <span>
                            {pet.name}
                            <span className="ml-1 text-muted-foreground text-xs capitalize">({pet.species})</span>
                          </span>
                          {petHasSpecialAlerts(parsePetSpecialAlerts(pet.special_alerts)) ? (
                            <Badge
                              variant="outline"
                              className="border-orange-400 bg-orange-50 text-orange-900 text-[10px] h-5"
                            >
                              Alert
                            </Badge>
                          ) : null}
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
                      <PetSpecialAlertsBanner specialAlerts={pet?.special_alerts} />
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
                        Resolved {form.room_rate_type === "off_peak" ? "off-peak" : "peak"} nightly price ({dogRatePetCount} pet{dogRatePetCount !== 1 ? "s" : ""})
                      </p>
                      <p className="text-sm font-medium">
                        {formatAed(dogRatePreview.data.unitPrice)} <span className="text-xs text-muted-foreground">({dogRatePreview.data.pricingKey})</span>
                      </p>
                      {dogNights > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {dogNights} night{dogNights !== 1 ? "s" : ""} total:{" "}
                          <span className="font-medium text-foreground">
                            {formatAed(dogRatePreview.data.unitPrice * dogNights)}
                          </span>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Could not resolve mapped price yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Room rate type</Label>
              <Select
                value={form.room_rate_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, room_rate_type: v as "peak" | "off_peak" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peak">Peak rate</SelectItem>
                  <SelectItem value="off_peak">Off peak rate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">Add-ons</Label>
              {form.pet_ids.length > 0 && (
                <p className="text-xs text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground">Pets:</span>{" "}
                  {selectedPetsSizeSummary(ownerPets, form.pet_ids)}
                </p>
              )}
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Grooming add-ons ({selectedDogSpecies === "cat" ? "cat-safe services" : "all dog services"})
                </p>
                <div className="space-y-2">
                  {visibleDogAddonOptions.map((addon) => {
                    const checked = !!form.addon_enabled[addon.id];
                    const value = form.addon_price_aed[addon.id] ?? "0";
                    return (
                      <div key={addon.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`addon_${addon.id}`}
                            checked={checked}
                            onCheckedChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                addon_enabled: { ...f.addon_enabled, [addon.id]: !!v },
                              }))
                            }
                          />
                          <Label htmlFor={`addon_${addon.id}`} className="cursor-pointer font-normal">
                            {addon.label}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">AED</span>
                          <Input
                            id={`addon_${addon.id}_price`}
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-[7rem]"
                            value={value}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                addon_price_aed: { ...f.addon_price_aed, [addon.id]: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Only checked add-ons with price above AED 0 are added to the invoice.
                </p>
              </div>

              <DogSizeField
                name="boarding-dog-new-booking"
                value={form.dog_size}
                onChange={(v) => setForm((f) => ({ ...f, dog_size: v }))}
              />
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
              {(form.pickup_required || form.dropoff_required) && (
                <div className="space-y-1 pt-0.5">
                  <Label className="text-xs text-muted-foreground font-normal">Transport zone</Label>
                  <Select
                    value={form.transport_region}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        transport_region: v as BoardingTransportRegion,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOARDING_TRANSPORT_REGION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
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
                <div className="flex shrink-0 items-center gap-2">
                  {(dogTransportPromo.applies || form.transport_free_of_charge) && form.pickup_required ? (
                    <span className="text-xs font-medium text-emerald-700">Complimentary</span>
                  ) : null}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 w-[7rem] text-right"
                    disabled={dogTransportPromo.applies || form.transport_free_of_charge || !form.pickup_required}
                    value={form.transport_pickup_price_aed}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        transport_pickup_price_aed: e.target.value,
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">AED</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
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
                <div className="flex shrink-0 items-center gap-2">
                  {(dogTransportPromo.applies || form.transport_free_of_charge) && form.dropoff_required ? (
                    <span className="text-xs font-medium text-emerald-700">Complimentary</span>
                  ) : null}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 w-[7rem] text-right"
                    disabled={dogTransportPromo.applies || form.transport_free_of_charge || !form.dropoff_required}
                    value={form.transport_dropoff_price_aed}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        transport_dropoff_price_aed: e.target.value,
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">AED</span>
                </div>
              </div>
              {(form.pickup_required || form.dropoff_required) && (
                <BoardingTransportRateHint
                  activeRate={activeTransportRate}
                  zone={resolvedDogTransportZone}
                  petCount={form.pet_ids.length}
                  pickup={form.pickup_required}
                  dropoff={form.dropoff_required}
                  promo={dogTransportPromo}
                  petNoun="dog"
                  freeOfCharge={form.transport_free_of_charge}
                />
              )}
              {(form.pickup_required || form.dropoff_required) && (
                <div className="flex items-start gap-3 rounded-md border border-muted bg-muted/20 px-3 py-2">
                  <Checkbox
                    id="dog_transport_free_of_charge"
                    checked={form.transport_free_of_charge}
                    disabled={dogTransportPromo.applies}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, transport_free_of_charge: v === true }))
                    }
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="dog_transport_free_of_charge" className="cursor-pointer font-medium text-sm">
                      Transportation — Free of charge
                    </Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      When enabled, pickup and drop-off are not billed on the invoice.
                    </p>
                  </div>
                </div>
              )}
              {dogTransportPromo.applies && (form.pickup_required || form.dropoff_required) ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                  {dogTransportPromo.notice}
                </div>
              ) : null}
              {form.transport_free_of_charge &&
              !dogTransportPromo.applies &&
              (form.pickup_required || form.dropoff_required) ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                  Transportation included at no charge — not added to the invoice.
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-3">
              {form.pet_ids.length > 0 && (
                <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Estimated total (this booking)
                  </p>
                  <div className="space-y-1.5 text-sm">
                    {dogRatePreview.data && dogNights > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Room ({dogNights} night{dogNights !== 1 ? "s" : ""})
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatAed(dogRatePreview.data.unitPrice * dogNights)}
                        </span>
                      </div>
                    )}
                    {(form.pickup_required || form.dropoff_required) && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Transport (est.)</span>
                        <span className="tabular-nums font-medium flex items-center justify-end gap-2">
                          {dogTransportPromo.applies || form.transport_free_of_charge ? (
                            <>
                              <span className="text-emerald-700">Free</span>
                              <Badge
                                variant="outline"
                                className="border-emerald-300 bg-emerald-100 text-emerald-800 text-[10px] shrink-0"
                              >
                                Free
                              </Badge>
                            </>
                          ) : (
                            formatAed(dogTransportEstimate)
                          )}
                        </span>
                      </div>
                    )}
                    {dogManualAddonTotal > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Grooming add-ons</span>
                        <span className="tabular-nums font-medium">
                          {formatAed(dogManualAddonTotal)}
                        </span>
                      </div>
                    )}
                    {dogBookingEstimateTotal > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{vatLineLabel()}</span>
                        <span className="tabular-nums font-medium">
                          {formatAed(dogBookingVatEstimate)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xl font-semibold tabular-nums border-t pt-2">
                    Total incl. VAT: {formatAed(dogBookingGrossEstimate)}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Includes room (when resolved), transport (if selected), grooming add-ons, and VAT.
                  </p>
                </div>
              )}
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
                value={form.staff_name}
                onChange={(e) => setForm((f) => ({ ...f, staff_name: e.target.value }))}
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
  staff_name: string;
  do_not_move: boolean;
  pickup_required: boolean;
  dropoff_required: boolean;
  transport_region: BoardingTransportRegion;
  transport_pickup_price_aed: string;
  transport_dropoff_price_aed: string;
  addon_enabled: Record<string, boolean>;
  addon_price_aed: Record<string, string>;
  room_rate_type: "peak" | "off_peak";
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
  staff_name: "",
  do_not_move: false,
  pickup_required: false,
  dropoff_required: false,
  transport_region: "dubai",
  transport_pickup_price_aed: "",
  transport_dropoff_price_aed: "",
  addon_enabled: {},
  addon_price_aed: {},
  room_rate_type: "off_peak",
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

  const resolvedCatTransportZone = useMemo(
    () => regionToTransportZone(form.transport_region),
    [form.transport_region],
  );

  const catActiveTransportRate = catTransportRates.find(
    (r) => r.key === transportPricingKey(resolvedCatTransportZone),
  );
  const catRatePetCount = Math.max(1, form.pet_ids.length);
  const catNights = nightsBetween(form.check_in_date, form.check_out_date);
  const catTransportPromo = useMemo(
    () => boardingTransportFreePromoFromRegion(catNights, form.transport_region),
    [catNights, form.transport_region],
  );
  const catSuggestedTripTransportAed = useMemo(() => {
    if (!catActiveTransportRate) return 0;
    const qty = transportQuantityForPets(
      resolvedCatTransportZone,
      Math.max(1, form.pet_ids.length),
    );
    return catActiveTransportRate.amount_aed * qty;
  }, [catActiveTransportRate, resolvedCatTransportZone, form.pet_ids.length]);

  const catRatePreview = useQuery({
    queryKey: [
      "boarding_rate_preview",
      "cat",
      form.room_id,
      catRatePetCount,
      form.check_in_date,
      form.check_out_date,
      form.room_rate_type,
    ],
    enabled: !!form.room_id,
    queryFn: async () =>
      resolveBoardingRate(form.room_id, catRatePetCount, {
        checkInDate: form.check_in_date || null,
        checkOutDate: form.check_out_date || null,
        rateType: form.room_rate_type,
      }),
  });

  const catTransportEstimate = useMemo(() => {
    if (!form.pickup_required && !form.dropoff_required) return 0;
    if (catTransportPromo.applies) return 0;
    let sum = 0;
    if (form.pickup_required) {
      sum += parseBoardingTransportAed(form.transport_pickup_price_aed);
    }
    if (form.dropoff_required) {
      sum += parseBoardingTransportAed(form.transport_dropoff_price_aed);
    }
    return sum;
  }, [
    catTransportPromo.applies,
    form.pickup_required,
    form.dropoff_required,
    form.transport_pickup_price_aed,
    form.transport_dropoff_price_aed,
  ]);

  useEffect(() => {
    if (!newBookingOpen) return;
    if (catTransportPromo.applies) {
      setForm((f) => ({
        ...f,
        transport_pickup_price_aed: "0",
        transport_dropoff_price_aed: "0",
      }));
      return;
    }
    const s =
      catSuggestedTripTransportAed > 0
        ? catSuggestedTripTransportAed.toFixed(2)
        : "";
    setForm((f) => ({
      ...f,
      transport_pickup_price_aed: s,
      transport_dropoff_price_aed: s,
    }));
  }, [
    newBookingOpen,
    form.transport_region,
    catSuggestedTripTransportAed,
    catTransportPromo.applies,
  ]);

  const selectedCatSpecies = useMemo<BoardingAddonSpecies>(() => {
    const hasDog = form.pet_ids.some((id) => ownerPets.find((p) => p.id === id)?.species !== "cat");
    return hasDog ? "dog" : "cat";
  }, [form.pet_ids, ownerPets]);

  const visibleCatAddonOptions = useMemo(
    () => addonOptionsForSpecies(selectedCatSpecies),
    [selectedCatSpecies],
  );

  const selectedCatAddons = useMemo(
    () =>
      selectedAddonEntries(
        form.addon_enabled,
        form.addon_price_aed,
        selectedCatSpecies,
      ),
    [form.addon_enabled, form.addon_price_aed, selectedCatSpecies],
  );

  const catManualAddonTotal = useMemo(
    () => selectedCatAddons.reduce((sum, row) => sum + row.amount, 0),
    [selectedCatAddons],
  );

  const catBookingEstimateTotal = useMemo(() => {
    let total = 0;
    if (catRatePreview.data && catNights > 0) {
      total += catRatePreview.data.unitPrice * catNights;
    }
    total += catTransportEstimate;
    total += catManualAddonTotal;
    return total;
  }, [
    catRatePreview.data,
    catNights,
    catTransportEstimate,
    catManualAddonTotal,
  ]);

  const catBookingVatEstimate = useMemo(
    () => vatAmountFromNet(catBookingEstimateTotal),
    [catBookingEstimateTotal],
  );
  const catBookingGrossEstimate = useMemo(
    () => grandTotalFromNet(catBookingEstimateTotal),
    [catBookingEstimateTotal],
  );

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

    const catTransportLabel = transportRegionLabel(form.transport_region);
    const catTransportComplimentary = catTransportPromo.applies;
    const catPetAddonHint = selectedPetsSizeSummary(ownerPets, form.pet_ids);
    const selectedAddonsForInvoice = selectedAddonEntries(
      form.addon_enabled,
      form.addon_price_aed,
      selectedCatSpecies,
    );
    const addons = [
      form.pickup_required &&
        `Pickup (${catTransportLabel})${catTransportComplimentary ? " — Free" : ""}`,
      form.dropoff_required &&
        `Drop-off (${catTransportLabel})${catTransportComplimentary ? " — Free" : ""}`,
      ...selectedAddonsForInvoice.map(
        ({ addon, amount }) =>
          `${addon.label} (${formatAed(amount)}${catPetAddonHint ? ` · ${catPetAddonHint}` : ""})`,
      ),
    ]
      .filter(Boolean)
      .join(", ");

    const catBlock = buildCatPreferencesNote(form);

    const payload: CreateBookingPayload = {
      owner_id: form.owner_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      pet_care_by_pet_id: form.pet_care_by_pet_id,
      notes: [
        form.notes,
        form.staff_name.trim() ? `Created by: ${form.staff_name.trim()}` : "",
        `Rate type: ${form.room_rate_type === "off_peak" ? "Off-peak" : "Peak"}`,
        catBlock,
        addons ? `Add-ons: ${addons}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      do_not_move: form.do_not_move,
      pickup_required: form.pickup_required,
      dropoff_required: form.dropoff_required,
      staff_id: null,
      status: "confirmed",
      booking_type: "boarding",
    };

    createBookingMut.mutate(payload, {
      onSuccess: (booking) => {
        toast.success("Booking created");
        setNewBookingOpen(false);

        const addonItems: {
          key: string;
          label: string;
          quantity?: number;
          unitPriceAed?: number;
        }[] = [];
        const catTKey = transportPricingKey(resolvedCatTransportZone);
        const catTZone = transportRegionLabel(form.transport_region);
        const catTQty = transportQuantityForPets(resolvedCatTransportZone, form.pet_ids.length);
        const catTSuffix = catTQty > 1 ? ` × ${catTQty} cats` : "";
        const catTComplimentary = catTransportPromo.applies;
        if (form.pickup_required) {
          const pickupTotal = catTComplimentary
            ? 0
            : parseBoardingTransportAed(form.transport_pickup_price_aed);
          addonItems.push({
            key: catTKey,
            label: `Pickup — ${catTZone}${catTSuffix}${catTComplimentary ? " (complimentary)" : ""}`,
            quantity: 1,
            unitPriceAed: pickupTotal,
          });
        }
        if (form.dropoff_required) {
          const dropTotal = catTComplimentary
            ? 0
            : parseBoardingTransportAed(form.transport_dropoff_price_aed);
          addonItems.push({
            key: catTKey,
            label: `Drop-off — ${catTZone}${catTSuffix}${catTComplimentary ? " (complimentary)" : ""}`,
            quantity: 1,
            unitPriceAed: dropTotal,
          });
        }
        const catSizeHint = selectedPetsSizeSummary(ownerPets, form.pet_ids);
        for (const { addon, amount } of selectedAddonsForInvoice) {
          addonItems.push({
            key: addon.pricingKey,
            label: catSizeHint ? `${addon.label} — ${catSizeHint}` : addon.label,
            quantity: 1,
            unitPriceAed: amount,
          });
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
          roomRateType: form.room_rate_type,
          addons: addonItems,
        }).then(() => {
          toast.success("Draft invoice created");
        }).catch((err) => {
          console.error("Auto-invoice failed:", err);
          toast.error("Invoice not created: " + (err?.message ?? "unknown error"));
        });
      },
      onError: (err) =>
        showCreateBookingErrorToast({
          err,
          navigate,
          ownerId: form.owner_id,
          petId: form.pet_ids[0],
          petName: ownerPets.find((p) => p.id === form.pet_ids[0])?.name,
        }),
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
              {bookingAnyPetHasAlerts(booking) ? (
                <TriangleAlert
                  className="h-3.5 w-3.5 shrink-0 text-orange-100 drop-shadow-sm"
                  aria-label="Pet alert"
                />
              ) : null}
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
                  <PopoverContent align="start" className="p-1 w-80 z-[120] pointer-events-auto">
                    {ownerResults.map((o) => (
                      <button key={o.id} type="button" className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent" onClick={() => { fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'post-fix',hypothesisId:'H6',location:'src/pages/Boarding.tsx:catBookingOwnerSelect',message:'cat boarding owner selected from popover',data:{ownerId:o.id},timestamp:Date.now()})}).catch(()=>{}); setForm((f) => ({ ...f, owner_id: o.id })); setOwnerSearch(`${ownerDisplayName(o.first_name, o.last_name)} — ${o.phone}`); setOwnerPopOpen(false); }}>
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
                        <Label
                          htmlFor={`cat-${pet.id}`}
                          className="cursor-pointer font-normal flex-1 flex flex-wrap items-center gap-2"
                        >
                          <span>
                            {pet.name}{" "}
                            <span className="ml-1 text-muted-foreground text-xs">(cat)</span>
                          </span>
                          {petHasSpecialAlerts(parsePetSpecialAlerts(pet.special_alerts)) ? (
                            <Badge
                              variant="outline"
                              className="border-orange-400 bg-orange-50 text-orange-900 text-[10px] h-5"
                            >
                              Alert
                            </Badge>
                          ) : null}
                        </Label>
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
                      <PetSpecialAlertsBanner specialAlerts={pet?.special_alerts} />
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
                        Resolved {form.room_rate_type === "off_peak" ? "off-peak" : "peak"} nightly price ({catRatePetCount} pet{catRatePetCount !== 1 ? "s" : ""})
                      </p>
                      <p className="text-sm font-medium">
                        {formatAed(catRatePreview.data.unitPrice)} <span className="text-xs text-muted-foreground">({catRatePreview.data.pricingKey})</span>
                      </p>
                      {catNights > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {catNights} night{catNights !== 1 ? "s" : ""} total:{" "}
                          <span className="font-medium text-foreground">
                            {formatAed(catRatePreview.data.unitPrice * catNights)}
                          </span>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Could not resolve mapped price yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Room rate type</Label>
              <Select
                value={form.room_rate_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, room_rate_type: v as "peak" | "off_peak" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peak">Peak rate</SelectItem>
                  <SelectItem value="off_peak">Off peak rate</SelectItem>
                </SelectContent>
              </Select>
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
              {(form.pickup_required || form.dropoff_required) && (
                <div className="space-y-1 pt-0.5">
                  <Label className="text-xs text-muted-foreground font-normal">Transport zone</Label>
                  <Select
                    value={form.transport_region}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        transport_region: v as BoardingTransportRegion,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOARDING_TRANSPORT_REGION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Checkbox id="pickup_cat" checked={form.pickup_required} onCheckedChange={(v) => setForm((f) => ({ ...f, pickup_required: !!v }))} />
                  <Label htmlFor="pickup_cat" className="cursor-pointer font-normal">Pickup (to facility)</Label>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {catTransportPromo.applies && form.pickup_required ? (
                    <span className="text-xs font-medium text-emerald-700">Complimentary</span>
                  ) : null}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 w-[7rem] text-right"
                    disabled={catTransportPromo.applies || !form.pickup_required}
                    value={form.transport_pickup_price_aed}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, transport_pickup_price_aed: e.target.value }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">AED</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Checkbox id="dropoff_cat" checked={form.dropoff_required} onCheckedChange={(v) => setForm((f) => ({ ...f, dropoff_required: !!v }))} />
                  <Label htmlFor="dropoff_cat" className="cursor-pointer font-normal">Drop-off (after stay)</Label>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {catTransportPromo.applies && form.dropoff_required ? (
                    <span className="text-xs font-medium text-emerald-700">Complimentary</span>
                  ) : null}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 w-[7rem] text-right"
                    disabled={catTransportPromo.applies || !form.dropoff_required}
                    value={form.transport_dropoff_price_aed}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, transport_dropoff_price_aed: e.target.value }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">AED</span>
                </div>
              </div>
              {(form.pickup_required || form.dropoff_required) && (
                <BoardingTransportRateHint
                  activeRate={catActiveTransportRate}
                  zone={resolvedCatTransportZone}
                  petCount={form.pet_ids.length}
                  pickup={form.pickup_required}
                  dropoff={form.dropoff_required}
                  promo={catTransportPromo}
                  petNoun="cat"
                />
              )}
              {catTransportPromo.applies && (form.pickup_required || form.dropoff_required) ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                  {catTransportPromo.notice}
                </div>
              ) : null}
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

            <div className="space-y-3">
              <Label className="text-sm font-medium">Add-ons</Label>
              {form.pet_ids.length > 0 && (
                <p className="text-xs text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground">Pets:</span>{" "}
                  {selectedPetsSizeSummary(ownerPets, form.pet_ids)}
                </p>
              )}
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Grooming add-ons ({selectedCatSpecies === "cat" ? "cat-safe services" : "all dog services"})
                </p>
                <div className="space-y-2">
                  {visibleCatAddonOptions.map((addon) => {
                    const checked = !!form.addon_enabled[addon.id];
                    const value = form.addon_price_aed[addon.id] ?? "0";
                    return (
                      <div key={addon.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`cat_addon_${addon.id}`}
                            checked={checked}
                            onCheckedChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                addon_enabled: { ...f.addon_enabled, [addon.id]: !!v },
                              }))
                            }
                          />
                          <Label htmlFor={`cat_addon_${addon.id}`} className="cursor-pointer font-normal">
                            {addon.label}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">AED</span>
                          <Input
                            id={`cat_addon_${addon.id}_price`}
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-[7rem]"
                            value={value}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                addon_price_aed: { ...f.addon_price_aed, [addon.id]: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Only checked add-ons with price above AED 0 are added to the invoice.
                </p>
              </div>

              {form.pet_ids.length > 0 && (
                <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Estimated total (this booking)
                  </p>
                  <div className="space-y-1.5 text-sm">
                    {catRatePreview.data && catNights > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Room ({catNights} night{catNights !== 1 ? "s" : ""})
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatAed(catRatePreview.data.unitPrice * catNights)}
                        </span>
                      </div>
                    )}
                    {(form.pickup_required || form.dropoff_required) && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Transport (est.)</span>
                        <span className="tabular-nums font-medium flex items-center justify-end gap-2">
                          {catTransportPromo.applies ? (
                            <>
                              <span className="text-emerald-700">Free</span>
                              <Badge
                                variant="outline"
                                className="border-emerald-300 bg-emerald-100 text-emerald-800 text-[10px] shrink-0"
                              >
                                Free
                              </Badge>
                            </>
                          ) : (
                            formatAed(catTransportEstimate)
                          )}
                        </span>
                      </div>
                    )}
                    {catManualAddonTotal > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Grooming add-ons</span>
                        <span className="tabular-nums font-medium">
                          {formatAed(catManualAddonTotal)}
                        </span>
                      </div>
                    )}
                    {catBookingEstimateTotal > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{vatLineLabel()}</span>
                        <span className="tabular-nums font-medium">
                          {formatAed(catBookingVatEstimate)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xl font-semibold tabular-nums border-t pt-2">
                    Total incl. VAT: {formatAed(catBookingGrossEstimate)}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Includes room (when resolved), transport (if selected), grooming add-ons, and VAT.
                  </p>
                </div>
              )}
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
              <Input placeholder="Who is creating this booking?" value={form.staff_name} onChange={(e) => setForm((f) => ({ ...f, staff_name: e.target.value }))} />
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
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      window.open(
                        `/print/kennel-card/${detailBooking.id}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
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
type BoardingListFocus = "all" | "check-ins" | "check-outs";

function BoardingOperationsList({
  species,
  initialDatePreset = "today",
  initialAnchorDate,
  focus = "all",
}: {
  species: Species;
  initialDatePreset?: BoardingListPreset;
  initialAnchorDate?: string;
  focus?: BoardingListFocus;
}) {
  const [datePreset, setDatePreset] = useState<BoardingListPreset>(initialDatePreset);
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate ?? toDateStr(new Date()));

  useEffect(() => {
    setDatePreset(initialDatePreset);
  }, [initialDatePreset]);

  useEffect(() => {
    if (initialAnchorDate) setAnchorDate(initialAnchorDate);
  }, [initialAnchorDate]);

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

    const focusRows = rows.filter((b) => {
      if (focus === "check-ins") return b.check_in_date === rangeStart;
      if (focus === "check-outs") return b.check_out_date === rangeStart;
      return true;
    });

    return focusRows.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
  }, [bookings, species, focus, rangeStart]);

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
          onClick={() => void printBoardingComingGoingList(filtered, rangeStart, rangeEnd, focus)}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/print/kennel-card/${booking.id}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
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
  const [searchParams] = useSearchParams();
  const todayStr = toDateStr(today);

  const initialSpecies: Species =
    location.hash === `#${CAT_BOARDING_SECTION_ID}` ? "cat" : "dog";
  const [species, setSpecies] = useState<Species>(initialSpecies);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const [windowStart, setWindowStart] = useState(() =>
    startOfWeek(today, { weekStartsOn: 1 }),
  );
  const windowEnd = addDays(windowStart, DAYS - 1);
  const requestedView = searchParams.get("view");
  const requestedDate = searchParams.get("date");

  const normalizedDate = useMemo(() => {
    if (!requestedDate) return null;
    if (requestedDate === "today") return todayStr;
    return /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : null;
  }, [requestedDate, todayStr]);

  const listFocus: BoardingListFocus = useMemo(() => {
    if (requestedView === "check-ins") return "check-ins";
    if (requestedView === "check-outs") return "check-outs";
    return "all";
  }, [requestedView]);

  useEffect(() => {
    if (listFocus !== "all") {
      setViewMode("list");
    }
  }, [listFocus]);

  useEffect(() => {
    if (normalizedDate) {
      setWindowStart(startOfWeek(parseISO(normalizedDate), { weekStartsOn: 1 }));
    }
  }, [normalizedDate]);

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
          <BoardingOperationsList
            species={species}
            focus={listFocus}
            initialAnchorDate={normalizedDate ?? undefined}
            initialDatePreset="today"
          />
        )}
      </div>
    </div>
  );
}

export default BoardingHubPage;
