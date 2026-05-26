import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  useBookingRoomAssignments,
  useRooms,
  useCreateBooking,
  useUpdateBooking,
  isAssessmentRequiredError,
} from "@/hooks/useBookings";
import type {
  BookingWithDetails,
  CalendarRoomAssignment,
  CreateBookingPayload,
} from "@/hooks/useBookings";
import {
  formatRoomAssignmentsSummary,
  roomLabelForBooking,
  sortedAssignmentSlices,
  type BookingRoomAssignmentSlice,
} from "@/lib/bookingRoomDisplay";
import { BoardingRoomCalendarRow } from "@/components/boarding/BoardingRoomCalendarRow";
import {
  calendarSegmentsForRoom,
  unassignedCalendarRowLabel,
  type BoardingCalendarSegment,
} from "@/lib/boardingCalendarModel";
import { useBoardingCalendarModel } from "@/hooks/useBoardingCalendarModel";
import { computeBoardingOccupancyStats } from "@/lib/boardingOccupancy";
import {
  buildBoardingRoomCalendarDayHtml,
  printBoardingRoomCalendarDay,
} from "@/lib/boardingCalendarPrint";
import { useOwners, useOwner } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import {
  PET_CARE_NOTES_SELECT,
  petFeedingNotes,
  petMedicationNotes,
} from "@/lib/petCareNotes";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import { CheckInSheet } from "@/components/CheckInSheet";
import { CheckOutSheet } from "@/components/CheckOutSheet";
import {
  buildRoomsBySection,
  formatBoardingRoomPickerLabel,
  formatRoomSectionLabel,
  getRoomSectionParts,
  isExcludedBoardingRoom,
  sortRoomsBySectionNumber,
} from "@/lib/boardingRoomSections";
import {
  splitFacilityAndPlaceholderRooms,
  isImportPlaceholderRoom,
  isImportPlaceholderBooking,
  IMPORT_PLACEHOLDER_STATUS_CLASS,
} from "@/lib/boardingUnknownKennel";
import { UnknownKennelCalendarSection } from "@/components/boarding/UnknownKennelCalendarSection";
import { ChangeRoomDialog } from "@/components/boarding/ChangeRoomDialog";
import { EditBoardingStayDates } from "@/components/boarding/EditBoardingStayDates";
import { DayShufflePanel } from "@/components/boarding/DayShufflePanel";
import { useMoveBoardingRoom } from "@/hooks/useMoveBoardingRoom";
import { formatBookingCell, bookingBelongingsCount, createBookingInvoice, ownerDisplayName } from "@/lib/bookingUtils";
import {
  netFromGrossInclusive,
  vatAmountFromGrossInclusive,
  vatLineLabel,
} from "@/lib/vatConfig";
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
import {
  largestDogSizeFormValue,
  petSizeToDogSizeFormValue,
  type DogSizeFormValue,
} from "@/lib/dogSizeForm";
import { resolveBoardingStayRates } from "@/lib/boardingPricing";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowRightLeft,
  Plus,
  Loader2,
  ExternalLink,
  Eye,
  Luggage,
  LayoutGrid,
  Printer,
  TriangleAlert,
  X,
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
const WING_LABELS: Record<string, string> = {
  oxford: "Oxford Street",
  piccadilly: "Piccadilly",
  park_lane: "Park Lane",
  fleet: "Fleet",
  back_kennels: "Back Kennels",
  grooming_upstairs: "Grooming Upstairs",
  bond_rooms: "Bond Rooms",
  dluxe: "Dluxe",
  standard_room: "Standard Room",
  royal_annex: "Royal Annex",
  royal_suite: "Royal Suite",
  bond_suite: "Bond Suite",
  pall_mall: "Pall Mall",
  deluxe_suite: "Deluxe Suite",
  deluxe_annex: "Deluxe Annex",
  standard_suite: "Standard Suite",
  little_gems: "Little Gems",
  lg_resting_nook: "LG Resting Nook",
  lg_grooming_room: "LG Grooming Room",
  furrari_lounge: "Furrari Lounge",
  grooming_room: "Grooming Room",
  training_room: "Training Room",
  kitchen: "Kitchen",
  import_placeholder: "Import placeholder (assign real room)",
};

const WING_ORDER: string[] = [
  "oxford",
  "back_kennels",
  "piccadilly",
  "park_lane",
  "fleet",
  "royal_annex",
  "royal_suite",
  "bond_suite",
  "pall_mall",
  "deluxe_suite",
  "deluxe_annex",
  "standard_suite",
  "little_gems",
  "lg_resting_nook",
  "lg_grooming_room",
  "furrari_lounge",
  "grooming_room",
  "training_room",
  "kitchen",
  "bond_rooms",
  "dluxe",
  "standard_room",
];

const STATUS_CLASSES: Record<BookingStatus, string> = {
  draft: "bg-slate-300 text-white hover:bg-slate-400",
  confirmed: "bg-blue-500 text-white hover:bg-blue-600",
  checked_in: "bg-emerald-500 text-white hover:bg-emerald-600",
  checked_out: "bg-slate-400 text-white hover:bg-slate-500",
  enquiry: "bg-amber-400 text-white hover:bg-amber-500",
  cancelled: "bg-red-400 text-white hover:bg-red-500",
  no_show: "bg-rose-300 text-white hover:bg-rose-400",
};

const STATUS_BADGE: Record<BookingStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
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

function renderKennelCardHtml(
  booking: BookingWithDetails,
  todayDate: string,
  assignments?: BookingRoomAssignmentSlice[] | null,
): string {
  const ownerName = ownerDisplayName(booking.owners?.first_name, booking.owners?.last_name);
  const roomName = roomLabelForBooking(booking, assignments);
  const notes = booking.notes || "No booking notes";
  const bookingRef = booking.booking_ref ?? booking.id.slice(0, 8);
  const status = booking.status.replace(/_/g, " ");
  const nights = nightsBetween(booking.check_in_date, booking.check_out_date);
  const petItems = booking.booking_pets
    .map((bp) => {
      const petName = bp.pets?.name ?? "Unknown pet";
      const petNote = bp.pets?.other_notes?.trim();
      const feeding = (bp.feeding_notes?.trim() || petFeedingNotes(bp.pets ?? undefined));
      const medication = (bp.medication_notes?.trim() || petMedicationNotes(bp.pets ?? undefined));
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
      const feeding = (bp.feeding_notes?.trim() || petFeedingNotes(bp.pets ?? undefined)) || "—";
      const medication = (bp.medication_notes?.trim() || petMedicationNotes(bp.pets ?? undefined)) || "—";
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
      `*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, other_notes, ${PET_CARE_NOTES_SELECT})), booking_items(count)`,
    )
    .in("id", ids);

  if (error || !data) return bookings;
  const byId = new Map<string, BookingWithDetails>();
  for (const row of data as unknown as BookingWithDetails[]) byId.set(row.id, row);
  return bookings.map((b) => byId.get(b.id) ?? b);
}

async function fetchBookingRoomAssignmentsByBookingId(
  bookingIds: string[],
): Promise<Map<string, BookingRoomAssignmentSlice[]>> {
  const map = new Map<string, BookingRoomAssignmentSlice[]>();
  if (bookingIds.length === 0) return map;

  const { data, error } = await supabase
    .from("booking_room_assignments")
    .select("booking_id, start_date, end_date, rooms(room_number, display_name)")
    .in("booking_id", bookingIds)
    .order("start_date", { ascending: true });

  if (error || !data) return map;

  for (const row of data) {
    const list = map.get(row.booking_id) ?? [];
    list.push({
      start_date: row.start_date,
      end_date: row.end_date,
      rooms: row.rooms as BookingRoomAssignmentSlice["rooms"],
    });
    map.set(row.booking_id, list);
  }
  return map;
}

async function printKennelCards(bookings: BookingWithDetails[], printTitle: string) {
  if (bookings.length === 0) return;
  const todayDate = toDateStr(new Date());
  const freshBookings = await hydrateBookingsForPrint(bookings);
  const assignmentsByBooking = await fetchBookingRoomAssignmentsByBookingId(
    freshBookings.map((b) => b.id),
  );
  const cardsHtml = freshBookings
    .map((b) => renderKennelCardHtml(b, todayDate, assignmentsByBooking.get(b.id)))
    .join("");
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

const BOARDING_OPERATIONS_PRINT_TIME = "12:00 PM (woof DIP-2)";

async function hydrateBookingsForComingGoingPrint(
  bookings: BookingWithDetails[],
): Promise<BookingWithDetails[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, breed, other_notes, ${PET_CARE_NOTES_SELECT}))`,
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
  pet_care_by_pet_id: Record<
    string,
    {
      feeding_notes: string;
      medication_notes: string;
      special_instructions: string;
    }
  >;
  /** From pet profile when set; required on save when any selected dog lacks `size`. */
  dog_size: DogSizeFormValue | null;
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
  pet_care_by_pet_id: {},
  dog_size: null,
};

export type DogBoardingCalendarProps = {
  windowStart: Date;
  onWindowStartChange: React.Dispatch<React.SetStateAction<Date>>;
  /** Hub renders the shared week toolbar */
  suppressToolbar?: boolean;
};

function AssignRealRoomPanel({
  booking,
  facilityRooms,
  onRoomAssigned,
}: {
  booking: BookingWithDetails;
  facilityRooms: Room[];
  onRoomAssigned: (room: Room) => void;
}) {
  const [pickedRoomId, setPickedRoomId] = useState("");
  const moveRoom = useMoveBoardingRoom();

  if (!isImportPlaceholderBooking(booking)) return null;

  const sorted = [...facilityRooms].sort((a, b) =>
    a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
  );

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/80 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-900">Imported — assign real room</p>
      <p className="text-xs text-amber-800/90">
        This stay is on an import placeholder. Choose a real kennel to move it off Unknown.
      </p>
      <Select value={pickedRoomId} onValueChange={setPickedRoomId}>
        <SelectTrigger>
          <SelectValue placeholder="Select real room…" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {sorted.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.room_number} — {r.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        className="w-full bg-amber-700 hover:bg-amber-800 text-white"
        disabled={!pickedRoomId || moveRoom.isPending}
        onClick={() => {
          const room = sorted.find((r) => r.id === pickedRoomId);
          if (!room) return;
          moveRoom.mutate(
            {
              bookingId: booking.id,
              effectiveDate: booking.check_in_date,
              targetRoomId: pickedRoomId,
              reason: "Assign real room from import placeholder",
            },
            {
              onSuccess: () => {
                toast.success(`Assigned to ${room.room_number}`);
                onRoomAssigned(room);
                setPickedRoomId("");
              },
              onError: (err) => {
                const overlap = getBookingRoomOverlapErrorMessage(err);
                toast.error(overlap ?? (err instanceof Error ? err.message : "Assign failed"));
              },
            },
          );
        }}
      >
        {moveRoom.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Assign real room
      </Button>
    </div>
  );
}

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

  useEffect(() => {
    const todayStr = toDateStr(new Date());
    if (todayStr >= startStr && todayStr <= endStr) {
      setCalendarPrintDate(todayStr);
    }
  }, [startStr, endStr]);

  // data
  const queryClient = useQueryClient();
  const { model: calendarModel, isLoading: calendarDataLoading } = useBoardingCalendarModel(
    startStr,
    endStr,
  );
  const {
    assignmentsByRoom,
    bookingsByRoom,
    sortedUnassignedBookings,
    assignmentsByBookingId,
  } = calendarModel;
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();

  // drawer / panel state
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<BookingWithDetails | null>(null);
  const [detailContext, setDetailContext] = useState<{ asOfDate: string } | null>(null);
  const [calendarPrintDate, setCalendarPrintDate] = useState(() => toDateStr(new Date()));
  const [form, setForm] = useState<NewBookingForm>({ ...BLANK_FORM });
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [checkInSheetOpen, setCheckInSheetOpen] = useState(false);
  const [checkOutSheetOpen, setCheckOutSheetOpen] = useState(false);
  const [belongingsReadOnly, setBelongingsReadOnly] = useState(false);
  const [changeRoomOpen, setChangeRoomOpen] = useState(false);

  // owner search
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerPopOpen, setOwnerPopOpen] = useState(false);
  const { data: ownerResults = [] } = useOwners(ownerSearch.trim().length >= 2 ? ownerSearch : undefined);

  // pets for selected owner (dog boarding: exclude cats)
  const { data: ownerPets = [] } = usePets(form.owner_id);
  const { data: dogBoardingOwnerProfile } = useOwner(form.owner_id);
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
      return (TRANSPORT_PRICING_KEYS as readonly string[]).map((key) => ({
        key,
        amount_aed: 0,
      }));
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
      dogRatePetCount,
      form.check_in_date,
      form.check_out_date,
    ],
    enabled: Boolean(form.check_in_date && form.check_out_date),
    queryFn: async () =>
      resolveBoardingStayRates(
        "",
        dogRatePetCount,
        form.check_in_date,
        form.check_out_date,
      ),
  });

  const dogsMissingProfileSize = useMemo(() => {
    return form.pet_ids
      .map((id) => dogBoardingPets.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && !p.size);
  }, [form.pet_ids, dogBoardingPets]);

  const dogSizeMissingHint = useMemo(() => {
    if (dogsMissingProfileSize.length === 0) return null;
    const names = dogsMissingProfileSize.map((p) => p.name ?? "Dog").join(", ");
    return `${names} ${dogsMissingProfileSize.length === 1 ? "has" : "have"} no size on the pet profile — choose a size for this stay.`;
  }, [dogsMissingProfileSize]);

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
      total += dogRatePreview.data.totalAed;
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

  const { data: dogMemberDiscountPreview } = useQuery<{
    discount_pct: number;
    discount_aed: number;
    final_aed: number;
  }>({
    queryKey: ["boarding", "dog", "member-discount-preview", form.owner_id, dogBookingEstimateTotal],
    enabled: Boolean(newBookingOpen && form.owner_id && dogBookingEstimateTotal > 0),
    queryFn: async () => {
      return {
        discount_pct: 0,
        discount_aed: 0,
        final_aed: dogBookingEstimateTotal,
      };
    },
  });

  const dogGrossAfterMember = dogMemberDiscountPreview?.final_aed ?? dogBookingEstimateTotal;
  const dogBookingVatEstimate = useMemo(
    () => vatAmountFromGrossInclusive(dogGrossAfterMember),
    [dogGrossAfterMember],
  );
  const dogBookingGrossEstimate = useMemo(() => Math.max(0, dogGrossAfterMember), [dogGrossAfterMember]);

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

  const { facility: dogFacilityRooms, placeholders: dogPlaceholderRooms } = useMemo(
    () => splitFacilityAndPlaceholderRooms(rooms),
    [rooms],
  );

  const assignableDogRooms = useMemo(
    () => dogFacilityRooms.filter((r) => !isExcludedBoardingRoom(r)),
    [dogFacilityRooms],
  );

  const filteredAssignableDogRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return assignableDogRooms;
    return assignableDogRooms.filter((r) => {
      const { section, roomNumber, label } = getRoomSectionParts(r);
      return (
        r.display_name.toLowerCase().includes(q) ||
        r.room_number.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        section.toLowerCase().includes(q) ||
        roomNumber.includes(q)
      );
    });
  }, [assignableDogRooms, roomSearch]);

  const { map: roomsBySection, order: roomSectionOrder } = useMemo(
    () => buildRoomsBySection(filteredAssignableDogRooms),
    [filteredAssignableDogRooms],
  );

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
    setForm((f) => ({ ...f, pet_ids: [], pet_care_by_pet_id: {}, dog_size: null }));
  }, [form.owner_id]);

  useEffect(() => {
    if (!newBookingOpen || form.pet_ids.length === 0) return;
    const profileSizes = form.pet_ids
      .map((id) => dogBoardingPets.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => petSizeToDogSizeFormValue(p.size))
      .filter((s): s is DogSizeFormValue => s != null);
    if (profileSizes.length === form.pet_ids.length) {
      const derived = largestDogSizeFormValue(profileSizes);
      if (derived) setForm((f) => ({ ...f, dog_size: derived }));
    }
  }, [newBookingOpen, form.pet_ids, dogBoardingPets]);

  const getInitialPetCare = (petId: string) => {
    const pet = ownerPets.find((p) => p.id === petId);
    return {
      feeding_notes: petFeedingNotes(pet),
      medication_notes: petMedicationNotes(pet),
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
    if (!form.owner_id || !form.check_in_date || !form.check_out_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.pet_ids.length === 0) {
      toast.error("Select at least one pet for this stay");
      return;
    }
    if (!form.dog_size) {
      toast.error("Select dog size for this stay (required when size is missing on the profile)");
      return;
    }
    const catInSelection = form.pet_ids.some(
      (id) => ownerPets.find((p) => p.id === id)?.species === "cat",
    );
    if (catInSelection) {
      toast.error("Cats cannot be booked for boarding in Woof");
      return;
    }
    const selectedRoom = assignableDogRooms.find((r) => r.id === form.room_id);

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
      room_id: form.room_id || null,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      pet_ids: form.pet_ids,
      pet_care_by_pet_id: form.pet_care_by_pet_id,
      notes: [
        form.notes,
        form.staff_name.trim() ? `Created by: ${form.staff_name.trim()}` : "",
        dogRatePreview.data
          ? `Rate: ${dogRatePreview.data.seasonSummary}`
          : "",
        `Dog size: ${form.dog_size}`,
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
    };

    createBooking.mutate(payload, {
      onSuccess: async (booking) => {
        if (booking.room_id) {
          const { error: moveErr } = await supabase.rpc("move_boarding_room", {
            p_booking_id: booking.id,
            p_effective_date: booking.check_in_date,
            p_target_room_id: booking.room_id,
            p_reason: "Initial room on booking create",
            p_moved_by: form.staff_name.trim() || null,
            p_override_do_not_move: false,
          });
          if (moveErr) {
            toast.error(
              getBookingRoomOverlapErrorMessage(moveErr) ??
                moveErr.message ??
                "Booking saved but room segment failed",
            );
          }
        }
        toast.success("Booking created");
        setNewBookingOpen(false);
        queryClient.invalidateQueries({ queryKey: ["booking_room_assignments"] });

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
          roomId: form.room_id || null,
          roomType: selectedRoom?.room_type ?? "boarding",
          roomName: selectedRoom?.room_number ?? undefined,
          petCount: form.pet_ids.length,
          checkInDate: form.check_in_date,
          checkOutDate: form.check_out_date,
          addons: addonItems,
        })
          .then(() => {
            toast.success("Draft invoice created");
          })
          .catch((err) => {
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

  const windowStartStr = toDateStr(windowStart);

  const renderCalendarCells = (
    segments: BoardingCalendarSegment[],
    options?: { prefillRoomOnEmptyCell?: string; isPlaceholder?: boolean },
  ) => (
    <BoardingRoomCalendarRow
      days={days}
      dayColW={DAY_COL_W}
      segments={segments}
      windowStartStr={windowStartStr}
      prefillRoomOnEmptyCell={options?.prefillRoomOnEmptyCell}
      isPlaceholder={options?.isPlaceholder}
      toDateStr={toDateStr}
      onEmptyCellClick={(roomId, dayStr) => openNewBooking(roomId, dayStr)}
      onGuestClick={(booking, asOfDate) => {
        setDetailBooking(booking);
        setDetailContext({ asOfDate });
      }}
      statusClassFor={(status) => STATUS_CLASSES[status]}
    />
  );

  const renderRoomRow = (roomId: string, isPlaceholder = false) =>
    renderCalendarCells(calendarSegmentsForRoom(calendarModel, roomId), {
      prefillRoomOnEmptyCell: roomId,
      isPlaceholder,
    });

  const isLoading = calendarDataLoading || roomsLoading;

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
            <Input
              type="date"
              className="h-9 w-36"
              value={calendarPrintDate}
              onChange={(e) => setCalendarPrintDate(e.target.value)}
              aria-label="Print day"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="boarding-calendar-print-day-btn"
              onClick={() => {
                const html = buildBoardingRoomCalendarDayHtml({
                  asOfDate: calendarPrintDate,
                  rooms: assignableDogRooms,
                  assignmentsByRoom,
                  bookingsByRoom,
                  unassignedBookings: calendarModel.unassignedBookings,
                });
                printBoardingRoomCalendarDay(html);
              }}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print day
            </Button>
            <Button data-testid="boarding-new-booking-btn" onClick={() => openNewBooking()}>
              <Plus className="mr-2 h-4 w-4" />
              New booking
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-2 border-b border-border bg-slate-50/90 shrink-0">
            <Label htmlFor="boarding-calendar-print-date" className="sr-only">
              Print day
            </Label>
            <Input
              id="boarding-calendar-print-date"
              type="date"
              className="h-8 w-36"
              value={calendarPrintDate}
              onChange={(e) => setCalendarPrintDate(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="boarding-calendar-print-day-btn"
              onClick={() => {
                const html = buildBoardingRoomCalendarDayHtml({
                  asOfDate: calendarPrintDate,
                  rooms: assignableDogRooms,
                  assignmentsByRoom,
                  bookingsByRoom,
                  unassignedBookings: calendarModel.unassignedBookings,
                });
                printBoardingRoomCalendarDay(html);
              }}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print day
            </Button>
            <Button data-testid="boarding-new-booking-btn" size="sm" onClick={() => openNewBooking()}>
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

              {/* Unassigned (no room) — always visible for optional room workflow */}
              <div>
                <div
                  className="flex sticky left-0 bg-slate-100 border-b border-t border-border"
                  style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}
                >
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Unassigned
                  </div>
                </div>
                {sortedUnassignedBookings.length === 0 ? (
                  <div className="flex">
                    <div
                      style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                      className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card"
                    >
                      <span className="truncate text-muted-foreground italic">No room</span>
                    </div>
                    {renderCalendarCells([])}
                  </div>
                ) : (
                  sortedUnassignedBookings.map((booking) => (
                    <div key={booking.id} className="flex">
                      <div
                        style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                        className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card"
                        title={unassignedCalendarRowLabel(booking)}
                      >
                        <span className="truncate text-muted-foreground italic">
                          {unassignedCalendarRowLabel(booking)}
                        </span>
                      </div>
                      {renderCalendarCells([{ kind: "booking", booking }])}
                    </div>
                  ))
                )}
              </div>

              {/* Section groups + room rows (section from room name prefix, number = trailing digits) */}
              {roomSectionOrder.map((sectionKey) => {
                const sectionRooms = roomsBySection.get(sectionKey) ?? [];
                if (sectionRooms.length === 0) return null;
                return (
                  <div key={sectionKey}>
                    <div
                      className="flex sticky left-0 bg-slate-50 border-b border-t border-border"
                      style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}
                    >
                      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {sectionKey}
                      </div>
                    </div>

                    {sectionRooms.map((room) => (
                      <div key={room.id} className="flex">
                        <div
                          style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                          className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card"
                        >
                          <span className="truncate" title={formatBoardingRoomPickerLabel(room)}>
                            <span className="font-medium">{formatRoomSectionLabel(room)}</span>
                            <span className="ml-1.5 text-[11px] text-muted-foreground capitalize">{room.room_type?.replace(/_/g, " ")}</span>
                          </span>
                        </div>
                        {/* Day cells */}
                        {renderRoomRow(room.id)}
                      </div>
                    ))}
                  </div>
                );
              })}

              <UnknownKennelCalendarSection
                placeholderRooms={dogPlaceholderRooms}
                roomColW={ROOM_COL_W}
                dayColW={DAY_COL_W}
                daysWidth={DAY_COL_W * DAYS}
                renderRoomRow={(roomId, isPlaceholder) => renderRoomRow(roomId, isPlaceholder)}
              />
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
              Boarding — dogs only. Room is optional; assign a kennel on the calendar when ready.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateBooking} className="mt-6 space-y-5">

            {/* Owner search */}
            <div className="space-y-2">
              <Label>Owner <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={ownerPopOpen} onOpenChange={setOwnerPopOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        data-testid="boarding-owner-search"
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
                          data-testid={`boarding-owner-option-${o.id}`}
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
                {dogBoardingOwnerProfile && dogBoardingOwnerProfile.id === form.owner_id ? null : null}
              </div>
            </div>

            {/* Pet selector — dog boarding only */}
            {form.owner_id && (
              <div className="space-y-2">
                <Label>Pets</Label>
                {ownerPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pets registered for this owner.</p>
                ) : dogBoardingPets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This owner only has cats — cats are not booked for boarding in Woof.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dogBoardingPets.map((pet) => (
                      <div key={pet.id} className="flex items-center gap-2">
                        <Checkbox
                          data-testid={`boarding-pet-checkbox-${pet.id}`}
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

            {/* Room (optional) */}
            <div className="space-y-2">
              <Label>Room <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Popover
                open={roomPickerOpen}
                onOpenChange={(open) => {
                  setRoomPickerOpen(open);
                  if (!open) setRoomSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    data-testid="boarding-room-select"
                    variant="outline"
                    role="combobox"
                    aria-expanded={roomPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {form.room_id ? (() => {
                      const sel = assignableDogRooms.find((r) => r.id === form.room_id);
                      if (!sel) return "Select room";
                      return formatBoardingRoomPickerLabel(sel);
                    })() : "No room — assign later"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search room name, number, or section..."
                      value={roomSearch}
                      onValueChange={setRoomSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {assignableDogRooms.length === 0
                          ? "No dog boarding rooms configured."
                          : "No rooms match your search."}
                      </CommandEmpty>
                      <CommandGroup heading="Assignment">
                        <CommandItem
                          value="__no_room__"
                          onSelect={() => {
                            setForm((f) => ({ ...f, room_id: "" }));
                            setRoomPickerOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${!form.room_id ? "opacity-100" : "opacity-0"}`}
                          />
                          No room — assign later
                        </CommandItem>
                      </CommandGroup>
                      {roomSectionOrder.map((sectionKey) => {
                        const sectionRooms = roomsBySection.get(sectionKey) ?? [];
                        if (sectionRooms.length === 0) return null;
                        return (
                          <CommandGroup key={sectionKey} heading={sectionKey}>
                            {sectionRooms.map((r) => (
                              <CommandItem
                                key={r.id}
                                value={r.id}
                                onSelect={(id) => {
                                  setForm((f) => ({ ...f, room_id: id === form.room_id ? "" : id }));
                                  setRoomPickerOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${form.room_id === r.id ? "opacity-100" : "opacity-0"}`} />
                                {formatBoardingRoomPickerLabel(r)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        );
                      })}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.check_in_date && form.check_out_date && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  {dogRatePreview.isLoading ? (
                    <p className="text-xs text-muted-foreground">Resolving boarding rate...</p>
                  ) : dogRatePreview.data ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {dogRatePreview.data.seasonSummary}
                        {dogNights > 0
                          ? ` · ${dogNights} night${dogNights !== 1 ? "s" : ""}`
                          : ""}
                      </p>
                      <p className="text-sm font-medium">
                        {formatAed(dogRatePreview.data.totalAed)}{" "}
                        <span className="text-xs text-muted-foreground">(standard boarding / night)</span>
                      </p>
                      {dogRatePreview.data.peakNights > 0 && dogRatePreview.data.offPeakNights > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Peak and off-peak nights are priced separately on the invoice.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Could not resolve boarding rate yet.</p>
                  )}
                </div>
              )}
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
                required={dogsMissingProfileSize.length > 0 || !form.dog_size}
                missingProfileHint={dogSizeMissingHint}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in <span className="text-destructive">*</span></Label>
                <Input
                  data-testid="boarding-checkin-date"
                  type="date"
                  value={form.check_in_date}
                  onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Check-out <span className="text-destructive">*</span></Label>
                <Input
                  data-testid="boarding-checkout-date"
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
              {form.check_in_date && form.check_out_date && (
                <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Estimated total (this booking)
                  </p>
                  <div className="space-y-1.5 text-sm">
                    {dogRatePreview.data && dogNights > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Boarding ({dogNights} night{dogNights !== 1 ? "s" : ""})
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatAed(dogRatePreview.data.totalAed)}
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
                      <div className="flex justify-between gap-4 font-medium">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatAed(dogBookingEstimateTotal)}</span>
                      </div>
                    )}
                    {(dogMemberDiscountPreview?.discount_aed ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-emerald-700">
                        <span>
                          Member discount
                          {dogMemberDiscountPreview?.discount_pct != null
                            ? ` (${Number(dogMemberDiscountPreview.discount_pct).toFixed(2)}%)`
                            : ""}
                        </span>
                        <span className="tabular-nums font-medium">
                          −{formatAed(dogMemberDiscountPreview!.discount_aed)}
                        </span>
                      </div>
                    )}
                    {dogBookingEstimateTotal > 0 && (
                      <div className="flex justify-between gap-4 font-medium">
                        <span>Total</span>
                        <span className="tabular-nums">{formatAed(netFromGrossInclusive(dogGrossAfterMember))}</span>
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
                    Includes boarding nights, transport (if selected), grooming add-ons, and VAT.
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

            <Button
              data-testid="boarding-save-booking-btn"
              type="submit"
              className="w-full"
              disabled={createBooking.isPending}
            >
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
            setDetailContext(null);
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
                  {(() => {
                    const slices = sortedAssignmentSlices(
                      (assignmentsByBookingId.get(detailBooking.id) ?? []).map((a) => ({
                        start_date: a.start_date,
                        end_date: a.end_date,
                        rooms: a.rooms,
                      })),
                    );
                    const asOfDate =
                      detailContext?.asOfDate ?? toDateStr(new Date());
                    const label = roomLabelForBooking(detailBooking, slices, { asOfDate });
                    const summaryLines = formatRoomAssignmentsSummary(slices, {
                      highlightDate: asOfDate,
                    });
                    if (label === "Unassigned" && summaryLines.length === 0) {
                      return <p className="text-sm text-muted-foreground italic">Unassigned</p>;
                    }
                    return (
                      <>
                        <p className="text-sm font-medium">
                          {detailContext?.asOfDate
                            ? `${label} (on ${format(parseISO(asOfDate), "d MMM yyyy")})`
                            : label}
                        </p>
                        {summaryLines.length > 1 ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
                            {summaryLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    );
                  })()}
                </div>

                {(!detailBooking.room_id || isImportPlaceholderBooking(detailBooking)) && (
                  <AssignRealRoomPanel
                    booking={detailBooking}
                    facilityRooms={assignableDogRooms}
                    onRoomAssigned={(room) =>
                      setDetailBooking((prev) =>
                        prev && prev.id === detailBooking.id
                          ? { ...prev, room_id: room.id, rooms: room }
                          : prev,
                      )
                    }
                  />
                )}

                <EditBoardingStayDates
                  booking={detailBooking}
                  onUpdated={(patch) =>
                    setDetailBooking((prev) =>
                      prev && prev.id === detailBooking.id ? { ...prev, ...patch } : prev,
                    )
                  }
                />
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

                  {detailBooking.status !== "cancelled" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      data-testid="boarding-change-room-btn"
                      onClick={() => setChangeRoomOpen(true)}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Change room
                    </Button>
                  )}

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
          <ChangeRoomDialog
            open={changeRoomOpen}
            onOpenChange={setChangeRoomOpen}
            booking={detailBooking}
            assignmentSlices={sortedAssignmentSlices(
              (assignmentsByBookingId.get(detailBooking.id) ?? []).map((a) => ({
                start_date: a.start_date,
                end_date: a.end_date,
                rooms: a.rooms,
              })),
            )}
            facilityRooms={assignableDogRooms}
            defaultEffectiveDate={detailContext?.asOfDate}
            onMoved={() => {
              queryClient.invalidateQueries({ queryKey: ["bookings"] });
              queryClient.invalidateQueries({ queryKey: ["booking_room_assignments"] });
            }}
          />
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
            roomName={roomLabelForBooking(
              detailBooking,
              sortedAssignmentSlices(
                (assignmentsByBookingId.get(detailBooking.id) ?? []).map((a) => ({
                  start_date: a.start_date,
                  end_date: a.end_date,
                  rooms: a.rooms,
                })),
              ),
              {
                asOfDate:
                  detailContext?.asOfDate ??
                  detailBooking.check_in_date,
              },
            )}
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
            roomName={roomLabelForBooking(
              detailBooking,
              sortedAssignmentSlices(
                (assignmentsByBookingId.get(detailBooking.id) ?? []).map((a) => ({
                  start_date: a.start_date,
                  end_date: a.end_date,
                  rooms: a.rooms,
                })),
              ),
              {
                asOfDate:
                  detailContext?.asOfDate ??
                  detailBooking.check_out_date,
              },
            )}
            checkInDate={detailBooking.check_in_date}
            checkOutDate={detailBooking.check_out_date}
            onFinished={handleBelongingsFlowFinished}
          />
        </>
      )}
    </>
  );
}

// ─── hub page ────────────────────────────────────────────────────────────────

type BoardingListPreset = "today" | "tomorrow" | "next7";
type BoardingListFocus = "all" | "check-ins" | "check-outs";

const OCCUPANCY_BOOKING_SELECT =
  `*, rooms(*), owners(first_name, last_name, other_notes), booking_pets(pet_id, feeding_notes, medication_notes, special_instructions, pets(name, other_notes, ${PET_CARE_NOTES_SELECT}, special_alerts))`;

function BoardingOperationsList({
  initialDatePreset = "today",
  initialAnchorDate,
  focus = "all",
}: {
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
    const rows = bookings.filter((b) => b.rooms?.wing !== "cattery");

    const focusRows = rows.filter((b) => {
      if (focus === "check-ins") return b.check_in_date === rangeStart;
      if (focus === "check-outs") return b.check_out_date === rangeStart;
      return true;
    });

    return focusRows.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
  }, [bookings, focus, rangeStart]);

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
  const [searchParams] = useSearchParams();
  const todayStr = toDateStr(today);

  const [viewMode, setViewMode] = useState<"calendar" | "list" | "shuffle">("calendar");

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

  const [occupancyOpen, setOccupancyOpen] = useState(false);
  const [occupancyDate, setOccupancyDate] = useState(todayStr);

  const { data: facilityRooms = [] } = useRooms();

  const { data: occRaw = [], isFetching: occLoading } = useQuery({
    queryKey: ["boarding", "occupancy-bookings", occupancyDate],
    enabled: occupancyOpen && !!occupancyDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(OCCUPANCY_BOOKING_SELECT)
        .eq("booking_type", "boarding")
        .lte("check_in_date", occupancyDate)
        .gt("check_out_date", occupancyDate)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data ?? []) as BookingWithDetails[];
    },
  });

  const { data: occAssignments = [], isFetching: occAssignmentsLoading } = useBookingRoomAssignments(
    occupancyDate,
    occupancyDate,
    { enabled: occupancyOpen && !!occupancyDate },
  );

  const occupancyStats = useMemo(
    () =>
      computeBoardingOccupancyStats({
        asOfDate: occupancyDate,
        facilityRooms,
        bookings: occRaw,
        assignments: occAssignments.map((row) => ({
          booking_id: row.booking_id,
          room_id: row.room_id,
          start_date: row.start_date,
          end_date: row.end_date,
          bookings: row.bookings,
        })),
      }),
    [occRaw, occAssignments, facilityRooms, occupancyDate],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      <TopBar title="Boarding" />

      <Dialog open={occupancyOpen} onOpenChange={setOccupancyOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle className="pr-8">Occupancy Report</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Boarding · as of{" "}
              {occupancyDate ? format(parseISO(occupancyDate), "EEEE, d MMMM yyyy") : "—"}
            </p>
            <div className="pt-2">
              <Label htmlFor="boarding-occ-date" className="text-xs text-muted-foreground">
                Report date
              </Label>
              <Input
                id="boarding-occ-date"
                type="date"
                className="mt-1 max-w-[12rem]"
                value={occupancyDate}
                onChange={(e) => setOccupancyDate(e.target.value)}
              />
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total rooms</p>
                <p className="text-2xl font-semibold tabular-nums">{occupancyStats.total}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Rooms occupied</p>
                <p className="text-2xl font-semibold tabular-nums">{occupancyStats.roomOccupiedCount}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Unassigned guests</p>
                <p className="text-2xl font-semibold tabular-nums">{occupancyStats.unassignedGuestCount}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-2xl font-semibold tabular-nums">{occupancyStats.availableCount}</p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 max-w-xs">
              <p className="text-xs text-muted-foreground">Occupancy (rooms + unassigned)</p>
              <p className="text-2xl font-semibold tabular-nums">
                {occLoading || occAssignmentsLoading ? "…" : `${occupancyStats.pct}%`}
              </p>
            </div>

            {occupancyStats.unassignedGuestCount > 0 && (
              <section className="space-y-2 rounded-lg border border-dashed p-3">
                <h3 className="text-sm font-semibold">Unassigned (no kennel room this day)</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Check in</TableHead>
                        <TableHead>Check out</TableHead>
                        <TableHead>Ref</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occupancyStats.unassignedGuests.map((booking) => {
                        const petNames =
                          booking.booking_pets
                            .map((bp) => bp.pets?.name)
                            .filter(Boolean)
                            .join(", ") || "—";
                        return (
                          <TableRow key={booking.id}>
                            <TableCell>{petNames}</TableCell>
                            <TableCell>
                              {ownerDisplayName(
                                booking.owners?.first_name,
                                booking.owners?.last_name,
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {format(parseISO(booking.check_in_date), "d MMM yyyy")}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {format(parseISO(booking.check_out_date), "d MMM yyyy")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{booking.booking_ref}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {occupancyStats.importedUnassignedCount > 0 && (
              <p className="text-sm rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-amber-900">
                <span className="font-medium">{occupancyStats.importedUnassignedCount}</span> imported stay
                {occupancyStats.importedUnassignedCount !== 1 ? "s" : ""} on import placeholders (excluded from occupancy %).
              </p>
            )}

            {occupancyStats.groupOrder.map((groupKey) => {
              const bucket = occupancyStats.byGroup.get(groupKey);
              if (!bucket) return null;
              if (bucket.occupied.length === 0 && bucket.available.length === 0) return null;
              const groupName = groupKey;
              return (
                <section key={groupKey} className="space-y-2 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold">{groupName}</h3>
                  {bucket.occupied.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Occupied</p>
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Room</TableHead>
                              <TableHead>Pet</TableHead>
                              <TableHead>Owner</TableHead>
                              <TableHead>Check in</TableHead>
                              <TableHead>Check out</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bucket.occupied.map(({ room, booking }) => {
                              const petNames =
                                booking.booking_pets
                                  .map((bp) => bp.pets?.name)
                                  .filter(Boolean)
                                  .join(", ") || "—";
                              return (
                                <TableRow key={booking.id}>
                                  <TableCell className="font-medium whitespace-nowrap">
                                    {formatRoomSectionLabel(room)}
                                  </TableCell>
                                  <TableCell>{petNames}</TableCell>
                                  <TableCell>
                                    {ownerDisplayName(
                                      booking.owners?.first_name,
                                      booking.owners?.last_name,
                                    )}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {format(parseISO(booking.check_in_date), "d MMM yyyy")}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {format(parseISO(booking.check_out_date), "d MMM yyyy")}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                  {bucket.available.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Available</p>
                      <p className="text-sm text-muted-foreground">
                        {bucket.available.map((r) => formatRoomSectionLabel(r)).join(", ")}
                      </p>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
          <DialogFooter className="border-t px-6 py-3 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={occLoading || occAssignmentsLoading}
              onClick={() => {
                const { map: roomsBySection, order } = buildRoomsBySection(
                  facilityRooms.filter(
                    (r) => r.is_active && !isImportPlaceholderRoom(r) && r.wing !== "cattery" && !isExcludedBoardingRoom(r),
                  ),
                );
                const assignmentsByRoom = new Map<string, CalendarRoomAssignment[]>();
                for (const row of occAssignments) {
                  const list = assignmentsByRoom.get(row.room_id) ?? [];
                  list.push(row);
                  assignmentsByRoom.set(row.room_id, list);
                }
                const bookingsByRoom = new Map<string, BookingWithDetails[]>();
                const bookingIdsWithSegments = new Set(occAssignments.map((r) => r.booking_id));
                for (const b of occRaw) {
                  if (bookingIdsWithSegments.has(b.id) || !b.room_id) continue;
                  const list = bookingsByRoom.get(b.room_id) ?? [];
                  list.push(b);
                  bookingsByRoom.set(b.room_id, list);
                }
                const flatRooms = order.flatMap((k) => roomsBySection.get(k) ?? []);
                const html = buildBoardingRoomCalendarDayHtml({
                  asOfDate: occupancyDate,
                  rooms: flatRooms,
                  assignmentsByRoom,
                  bookingsByRoom,
                  unassignedBookings: occRaw.filter(
                    (b) =>
                      !bookingIdsWithSegments.has(b.id) &&
                      (!b.room_id || isImportPlaceholderBooking(b)),
                  ),
                });
                printBoardingRoomCalendarDay(html);
              }}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print day
            </Button>
            <Button type="button" variant="outline" onClick={() => setOccupancyOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toolbar: week nav + manage rooms ── */}
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
            <button
              type="button"
              data-testid="boarding-day-shuffle-tab"
              className={`px-3 py-1.5 transition-colors ${viewMode === "shuffle" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => setViewMode("shuffle")}
            >
              Day shuffle
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOccupancyDate(normalizedDate ?? todayStr);
              setOccupancyOpen(true);
            }}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Occupancy Report
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/settings/rooms")}
          >
            Manage Rooms
          </Button>
        </div>
      </div>

      {/* ── Calendar (only one rendered at a time) ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {viewMode === "calendar" ? (
          <DogBoardingCalendar
            windowStart={windowStart}
            onWindowStartChange={setWindowStart}
            suppressToolbar
          />
        ) : viewMode === "shuffle" ? (
          <DayShufflePanel initialDate={normalizedDate ?? todayStr} />
        ) : (
          <BoardingOperationsList
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
