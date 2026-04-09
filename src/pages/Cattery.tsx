import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, differenceInCalendarDays, isToday, parseISO } from "date-fns";
import {
  useBookings,
  useRooms,
  useCreateBooking,
  useUpdateBooking,
} from "@/hooks/useBookings";
import type { BookingWithDetails, CreateBookingPayload } from "@/hooks/useBookings";
import { useOwners } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import { formatBookingCell, bookingBelongingsCount } from "@/lib/bookingUtils";
import { CheckInSheet } from "@/components/CheckInSheet";
import { CheckOutSheet } from "@/components/CheckOutSheet";
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
import { ChevronLeft, ChevronRight, Plus, Loader2, ExternalLink, Eye, Luggage } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

type BookingStatus = Database["public"]["Enums"]["booking_status"];
type CatteryRoomType =
  | "cattery_super_presidential"
  | "cattery_presidential"
  | "cattery_deluxe";

const DAYS = 14;
const ROOM_COL_W = 160;
const DAY_COL_W = 100;

const TIER_ORDER: CatteryRoomType[] = [
  "cattery_super_presidential",
  "cattery_presidential",
  "cattery_deluxe",
];

const TIER_LABELS: Record<CatteryRoomType, string> = {
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

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

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
  cat_litter_type: string;
  cat_indoor_only: boolean;
  cat_ok_share_family: boolean;
  cat_special_diet: string;
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
  cat_litter_type: "",
  cat_indoor_only: false,
  cat_ok_share_family: true,
  cat_special_diet: "",
};

function buildCatPreferencesNote(f: NewBookingForm): string {
  const lines = [
    "Cat preferences:",
    f.cat_litter_type.trim() ? `Litter type: ${f.cat_litter_type.trim()}` : null,
    `Indoor only: ${f.cat_indoor_only ? "Yes" : "No"}`,
    `OK to share with family cats: ${f.cat_ok_share_family ? "Yes" : "No"}`,
    f.cat_special_diet.trim() ? `Special diet: ${f.cat_special_diet.trim()}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export type CatBoardingCalendarProps = {
  windowStart: Date;
  onWindowStartChange: React.Dispatch<React.SetStateAction<Date>>;
  suppressToolbar?: boolean;
};

/** Cat boarding calendar (embedded under unified Boarding page; no TopBar). */
export function CatBoardingCalendar({
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

  const catteryRooms = useMemo(
    () => roomsAll.filter((r) => r.wing === "cattery"),
    [roomsAll],
  );

  const roomsByTier = useMemo(() => {
    const map = new Map<CatteryRoomType, Room[]>();
    TIER_ORDER.forEach((t) => map.set(t, []));
    catteryRooms.forEach((r) => {
      const rt = r.room_type as CatteryRoomType;
      if (map.has(rt)) map.get(rt)!.push(r);
    });
    return map;
  }, [catteryRooms]);

  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<BookingWithDetails | null>(null);
  const [form, setForm] = useState<NewBookingForm>({ ...BLANK_FORM });

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

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

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
      ...BLANK_FORM,
      room_id: roomId ?? "",
      check_in_date: date ?? "",
      check_out_date: date ? toDateStr(addDays(parseISO(date), 1)) : "",
    });
    setOwnerSearch("");
    setNewBookingOpen(true);
  };

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
    const selectedRoom = catteryRooms.find((r) => r.id === form.room_id);
    if (!selectedRoom) {
      toast.error("Please select a cattery room");
      return;
    }

    const addons = [
      form.addon_transport_dubai && "Transport Dubai",
      form.addon_transport_abudhabi && "Transport Abu Dhabi",
      form.addon_groom && "Full Groom on checkout",
      form.addon_bath && "Full Bath on checkout",
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
      notes: [form.notes, catBlock, addons ? `Add-ons: ${addons}` : ""]
        .filter(Boolean)
        .join("\n\n"),
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

  const renderRoomRow = (roomId: string) => {
    const roomBookings = bookingsByRoom.get(roomId) ?? [];
    const dayBookingMap = new Map<
      string,
      { booking: BookingWithDetails; span: number; isFirst: boolean }
    >();

    roomBookings.forEach((b) => {
      days.forEach((day, idx) => {
        const dayStr = toDateStr(day);
        if (dayStr >= b.check_in_date && dayStr < b.check_out_date) {
          const isFirst = dayStr === b.check_in_date || idx === 0;
          if (isFirst) {
            const endOfWindow = toDateStr(addDays(windowStart, DAYS));
            const chipEnd =
              b.check_out_date < endOfWindow ? b.check_out_date : endOfWindow;
            const span = differenceInCalendarDays(
              parseISO(chipEnd),
              parseISO(dayStr === b.check_in_date ? b.check_in_date : toDateStr(day)),
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
          const label =
            formatBookingCell(names, booking.owners?.last_name ?? "") ||
            booking.booking_ref ||
            "—";

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
              <span className="truncate min-w-0 flex-1">{label}</span>
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

  return (
    <>
      <main className={`flex flex-col ${suppressToolbar ? "" : "flex-1 overflow-hidden"}`}>
        {!suppressToolbar ? (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => onWindowStartChange((d) => addDays(d, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onWindowStartChange(startOfWeek(today, { weekStartsOn: 1 }))}
              >
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
          <div className="flex items-center justify-end px-6 py-2 border-b border-border bg-violet-50/90 shrink-0">
            <Button size="sm" onClick={() => openNewBooking()}>
              <Plus className="mr-2 h-4 w-4" />
              New cat booking
            </Button>
          </div>
        )}

        <div className={suppressToolbar ? "" : "flex-1 overflow-auto"}>
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : catteryRooms.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">
              No active cat boarding rooms found. Add rooms with wing &quot;cattery&quot; in Settings → Rooms.
            </p>
          ) : (
            <div style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}>
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

              {TIER_ORDER.map((tier) => {
                const tierRooms = roomsByTier.get(tier) ?? [];
                if (tierRooms.length === 0) return null;
                return (
                  <div key={tier}>
                    <div
                      className="flex sticky left-0 bg-violet-50 border-b border-t border-border"
                      style={{ minWidth: ROOM_COL_W + DAY_COL_W * DAYS }}
                    >
                      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-900">
                        {TIER_LABELS[tier]}
                      </div>
                    </div>
                    {tierRooms.map((room) => (
                      <div key={room.id} className="flex">
                        <div
                          style={{ minWidth: ROOM_COL_W, width: ROOM_COL_W }}
                          className="shrink-0 border-r border-b border-border flex items-center px-3 text-sm text-foreground bg-card"
                        >
                          <span className="truncate">{room.display_name}</span>
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

      <Sheet open={newBookingOpen} onOpenChange={setNewBookingOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Booking</SheetTitle>
            <SheetDescription>
              Cat boarding — only cats are listed below. Pick a room in the cat boarding grid.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreateBooking} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>
                Owner <span className="text-destructive">*</span>
              </Label>
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
                        <span className="font-medium">
                          {o.first_name} {o.last_name}
                        </span>
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
                  <p className="text-sm text-muted-foreground">
                    This owner has no cats — use <strong>Dog boarding</strong> above for dogs.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {catPets.map((pet) => (
                      <div key={pet.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`cat-${pet.id}`}
                          checked={form.pet_ids.includes(pet.id)}
                          onCheckedChange={() => togglePet(pet.id)}
                        />
                        <Label htmlFor={`cat-${pet.id}`} className="cursor-pointer font-normal">
                          {pet.name}
                          <span className="ml-1 text-muted-foreground text-xs">(cat)</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Room <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.room_id}
                onValueChange={(v) => setForm((f) => ({ ...f, room_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {TIER_ORDER.map((tier) => {
                    const tr = roomsByTier.get(tier) ?? [];
                    if (tr.length === 0) return null;
                    return (
                      <div key={tier}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                          {TIER_LABELS[tier]}
                        </div>
                        {tr.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.display_name}
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Check-in <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.check_in_date}
                  onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Check-out <span className="text-destructive">*</span>
                </Label>
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
                  id="pickup_required_cat"
                  checked={form.pickup_required}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, pickup_required: !!v }))
                  }
                />
                <Label htmlFor="pickup_required_cat" className="cursor-pointer font-normal">
                  Pickup required (to facility)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dropoff_required_cat"
                  checked={form.dropoff_required}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, dropoff_required: !!v }))
                  }
                />
                <Label htmlFor="dropoff_required_cat" className="cursor-pointer font-normal">
                  Drop-off required (after stay)
                </Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">Cat preferences</Label>
              <div className="space-y-2">
                <Label htmlFor="cat_litter" className="text-xs text-muted-foreground font-normal">
                  Litter type
                </Label>
                <Input
                  id="cat_litter"
                  placeholder="e.g. clumping, wood pellet…"
                  value={form.cat_litter_type}
                  onChange={(e) => setForm((f) => ({ ...f, cat_litter_type: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="cat_indoor" className="cursor-pointer">
                  Indoor only
                </Label>
                <Switch
                  id="cat_indoor"
                  checked={form.cat_indoor_only}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, cat_indoor_only: v }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="cat_share" className="cursor-pointer">
                  OK to share with family cats
                </Label>
                <Switch
                  id="cat_share"
                  checked={form.cat_ok_share_family}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, cat_ok_share_family: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat_diet" className="text-xs text-muted-foreground font-normal">
                  Special diet notes
                </Label>
                <Textarea
                  id="cat_diet"
                  rows={3}
                  placeholder="Feeding restrictions, wet/dry, portions…"
                  value={form.cat_special_diet}
                  onChange={(e) => setForm((f) => ({ ...f, cat_special_diet: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

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
                    <Label htmlFor={key} className="cursor-pointer font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="do_not_move_cat" className="cursor-pointer">
                DO NOT MOVE
              </Label>
              <Switch
                id="do_not_move_cat"
                checked={form.do_not_move}
                onCheckedChange={(v) => setForm((f) => ({ ...f, do_not_move: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

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
                <SheetTitle>{detailBooking.booking_ref ?? "Booking Details"}</SheetTitle>
                <SheetDescription>Reservation overview and actions.</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={STATUS_BADGE[detailBooking.status]}>
                    {detailBooking.status
                      .replace("_", " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                  {detailBooking.do_not_move && (
                    <Badge
                      variant="outline"
                      className="bg-orange-100 text-orange-800 border-orange-200"
                    >
                      DO NOT MOVE
                    </Badge>
                  )}
                </div>

                <Separator />

                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Owner</p>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => navigate(`/customers/${detailBooking.owner_id}`)}
                  >
                    {detailBooking.owners?.first_name} {detailBooking.owners?.last_name}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>

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
                                `/customers/${detailBooking.owner_id}/pets/${bp.pet_id}`,
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

                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Room</p>
                  <p className="text-sm">{detailBooking.rooms?.display_name ?? "—"}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
                    <p className="text-sm">
                      {format(parseISO(detailBooking.check_in_date), "d MMM yyyy")}
                    </p>
                    {detailBooking.actual_check_in_at && (
                      <p className="text-xs text-muted-foreground">
                        Actual:{" "}
                        {format(parseISO(detailBooking.actual_check_in_at), "d MMM HH:mm")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
                    <p className="text-sm">
                      {format(parseISO(detailBooking.check_out_date), "d MMM yyyy")}
                    </p>
                    {detailBooking.actual_check_out_at && (
                      <p className="text-xs text-muted-foreground">
                        Actual:{" "}
                        {format(parseISO(detailBooking.actual_check_out_at), "d MMM HH:mm")}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date)} night
                  {nightsBetween(detailBooking.check_in_date, detailBooking.check_out_date) !== 1
                    ? "s"
                    : ""}
                </p>

                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Transport</p>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="cat_detail_pickup_required" className="font-normal text-sm cursor-pointer">
                      Pickup (check-in)
                    </Label>
                    <Switch
                      id="cat_detail_pickup_required"
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
                    <Label htmlFor="cat_detail_dropoff_required" className="font-normal text-sm cursor-pointer">
                      Drop-off (check-out)
                    </Label>
                    <Switch
                      id="cat_detail_dropoff_required"
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

                {detailBooking.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                    <p className="text-sm whitespace-pre-line">{detailBooking.notes}</p>
                  </div>
                )}

                <Separator />

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

                  {(detailBooking.status === "confirmed" ||
                    detailBooking.status === "enquiry") && (
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
                          },
                        )
                      }
                    >
                      {updateBooking.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
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
};

export default CatBoardingCalendar;
