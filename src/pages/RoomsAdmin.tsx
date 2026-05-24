/**
 * RoomsAdmin — /settings/rooms
 *
 * Inline-editable table of all rooms. Each cell can be clicked to edit.
 * Text / number fields save on blur or Enter. Enum select fields save on
 * change. Active and Camera recording toggles save immediately.
 */

import {
  useState,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
  useEffect,
  KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/dashboard/TopBar";
import { useUpdateRoom, useCreateRoom, useDeleteRoom, useAllRooms } from "@/hooks/useBookings";
import { useCreateRoomType, useRoomTypesQuery } from "@/hooks/useRoomTypes";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Trash2, Download, Pencil, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];
type RoomInsert = Database["public"]["Tables"]["rooms"]["Insert"];
type RoomWing = Database["public"]["Enums"]["room_wing"];
type RoomType = Database["public"]["Enums"]["room_type"];
type CapacityType = Database["public"]["Enums"]["capacity_type"];
type RoomPetType = NonNullable<RoomInsert["pet_type"]>;

// ── Display labels ────────────────────────────────────────────────────────────

const WING_LABELS: Record<string, string> = {
  oxford: "Oxford Street",
  piccadilly: "Piccadilly",
  park_lane: "Park Lane",
  fleet: "Fleet Street",
  back_kennels: "Back Kennels",
  grooming_upstairs: "Grooming Upstairs",
  bond_rooms: "Bond Rooms",
  dluxe: "Dluxe",
  standard_room: "Standard Room",
  bond_suite: "Bond Suite",
  royal_annex: "Royal Annex",
  royal_suite: "Royal Suite",
  pall_mall: "Pall Mall",
  little_gems: "Little Gems",
  standard_suite: "Standard Suite",
  grooming_room: "Grooming Room",
  training_room: "Training Room",
  deluxe_annex: "Deluxe Annex",
  deluxe_suite: "Deluxe Suite",
  lg_resting_nook: "LG Resting Nook",
  lg_grooming_room: "LG Grooming Room",
  furrari_lounge: "Furrari Lounge",
  kitchen: "Kitchen",
  import_placeholder: "Import placeholder (unknown kennel)",
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  presidential_super: "Presidential Super",
  presidential_standard: "Presidential Standard",
  presidential_single: "Presidential Single",
  presidential_double: "Presidential Double",
  royal_suite_double: "Royal Suite Double",
  royal_suite_single: "Royal Suite Single",
  double_royal: "Double Royal",
  single_royal: "Single Royal",
  family_room: "Family Room",
  royal_annex: "Royal Annex",
  park_lane: "Park Lane",
  pall_mall: "Pall Mall",
  kennels: "Back Kennels",
  deluxe: "Deluxe",
  standard: "Standard",
  standard_glass: "Standard Glass",
  lg_deluxe: "LG Deluxe",
  lg_royal: "LG Royal",
  lg_standard: "LG Standard",
  lg_presidential: "LG Presidential",
  lg_presidential_double: "LG Presidential Double",
  lg_royal_double: "LG Royal Double",
  lg_standard_luxury: "LG Standard Luxury",
  lg_resting_nook: "LG Resting Nook",
  kitchen: "Kitchen",
};

const CAPACITY_LABELS: Record<CapacityType, string> = {
  single: "Single",
  twin: "Twin",
  twin_plus: "Twin+",
  multiple: "Multiple",
};

const WING_VALUES: RoomWing[] = [
  "bond_rooms",
  "dluxe",
  "standard_room",
  "oxford",
  "piccadilly",
  "park_lane",
  "fleet",
  "back_kennels",
  "grooming_upstairs",
];

const ROOM_TYPE_VALUES: RoomType[] = [
  "presidential_super",
  "presidential_standard",
  "royal_suite_double",
  "royal_suite_single",
  "double_royal",
  "single_royal",
  "family_room",
  "royal_annex",
  "park_lane",
  "pall_mall",
  "kennels",
];

const CAPACITY_VALUES: CapacityType[] = ["single", "twin", "twin_plus", "multiple"];

const MIN_MAX_PETS = 1;
const MAX_MAX_PETS = 100;
const ROOMS_PAGE_SIZE = 50;

const ROOM_LABEL_PRESET_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#78716C",
  "#FFFFFF",
] as const;

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function clampMaxPets(n: number): number {
  if (!Number.isFinite(n)) return MIN_MAX_PETS;
  return Math.min(MAX_MAX_PETS, Math.max(MIN_MAX_PETS, Math.round(n)));
}

/** Display / edit seed for max_pets — integers only, clamped (fixes legacy decimals in DB). */
function formatMaxPetsForUi(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? String(clampMaxPets(n)) : "";
}

/**
 * Dedicated editor for max_pets so blur/save does not share global editValue/ref with other cells
 * (which caused lost updates). Persists to DB on blur via onSave.
 */
function MaxPetsCell({
  room,
  isEditing,
  onOpen,
  onClose,
  onSave,
}: {
  room: Room;
  isEditing: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (roomId: string, maxPets: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  const wasEditingRef = useRef(false);

  useLayoutEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      const seed = formatMaxPetsForUi(room.max_pets);
      setDraft(seed);
      draftRef.current = seed;
      queueMicrotask(() => inputRef.current?.focus());
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, room]);

  const commitFromBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    const raw = draftRef.current;
    const digits = raw.replace(/\D/g, "");
    const n = digits === "" ? NaN : parseInt(digits, 10);
    const value = clampMaxPets(Number.isNaN(n) ? MIN_MAX_PETS : n);
    const prevMax = clampMaxPets(Number(room.max_pets));
    onClose();
    if (value !== prevMax) {
      onSave(room.id, value);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Max pets for ${room.display_name}`}
        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-right tabular-nums"
        value={draft}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, "");
          if (v.length > 3) v = v.slice(0, 3);
          if (v !== "") {
            let num = parseInt(v, 10);
            if (num > MAX_MAX_PETS) num = MAX_MAX_PETS;
            v = String(num);
          }
          draftRef.current = v;
          setDraft(v);
        }}
        onBlur={commitFromBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onClose();
          }
        }}
      />
    );
  }

  const displayVal = formatMaxPetsForUi(room.max_pets) || null;
  return (
    <span
      className="block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted/60 transition-colors min-w-[60px] text-right tabular-nums"
      onClick={() => onOpen()}
      title="Click to edit"
    >
      {displayVal ?? <span className="text-muted-foreground">—</span>}
    </span>
  );
}

// ── Editable cell helpers ─────────────────────────────────────────────────────

type EditingCell = { id: string; field: string } | null;

/** Supabase / react-query often pass plain objects, not Error instances. */
function formatRoomMutationError(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    if (typeof msg === "object" && msg !== null) {
      try {
        return JSON.stringify(msg);
      } catch {
        /* fall through */
      }
    }
    if (typeof o.error === "string" && o.error.trim()) return o.error;
    if (typeof o.details === "string" && o.details.trim()) return o.details;
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint;
    try {
      return JSON.stringify(o);
    } catch {
      return "Unknown error";
    }
  }
  return String(err);
}

function roomsSchemaMigrationHint(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("label_color")) {
    return "The database is missing column rooms.label_color. Apply sql/add-rooms-label-color.sql in the Supabase SQL Editor, then refresh the app.";
  }
  if (
    m.includes("camera_recording") ||
    (m.includes("schema cache") && m.includes("rooms")) ||
    (m.includes("could not find") && m.includes("rooms"))
  ) {
    return "The database is missing column rooms.camera_recording. Apply the migration: supabase/migrations/20260510120000_add_rooms_camera_recording.sql (Supabase CLI or SQL Editor), then refresh the app.";
  }
  return null;
}

function toastRoomSaveFailed(err: unknown) {
  const msg = formatRoomMutationError(err);
  const hint = roomsSchemaMigrationHint(msg);
  toast.error(hint ?? `Save failed: ${msg}`, hint ? { duration: 12_000 } : undefined);
}

function RoomColorCell({
  room,
  onSave,
}: {
  room: Room;
  onSave: (roomId: string, labelColor: string | null) => void;
}) {
  const color = normalizeHexColor(room.label_color);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60 transition-colors"
          aria-label={`Set color label for ${room.display_name}`}
        >
          <span
            className="h-5 w-5 shrink-0 rounded-full border border-border shadow-sm"
            style={{ backgroundColor: color ?? "transparent" }}
          />
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {color ?? "None"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Room color label</p>
        <div className="grid grid-cols-5 gap-2">
          {ROOM_LABEL_PRESET_COLORS.map((preset) => {
            const selected = color === preset;
            return (
              <button
                key={preset}
                type="button"
                title={preset}
                className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                  selected ? "ring-2 ring-ring ring-offset-2" : "border-border"
                }`}
                style={{ backgroundColor: preset }}
                onClick={() => onSave(room.id, preset)}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor={`room-color-${room.id}`} className="text-xs shrink-0">
            Custom
          </Label>
          <Input
            id={`room-color-${room.id}`}
            type="color"
            value={color ?? "#3B82F6"}
            className="h-8 w-12 cursor-pointer p-1"
            onChange={(e) => onSave(room.id, e.target.value.toUpperCase())}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 w-full text-xs"
          onClick={() => onSave(room.id, null)}
        >
          Clear color
        </Button>
      </PopoverContent>
    </Popover>
  );
}

const DOG_WINGS: string[] = [
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
const WING_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "All Wings" },
  { value: "oxford", label: "Oxford Street" },
  { value: "back_kennels", label: "Back Kennels" },
  { value: "piccadilly", label: "Piccadilly" },
  { value: "park_lane", label: "Park Lane" },
  { value: "fleet", label: "Fleet" },
  { value: "royal_annex", label: "Royal Annex" },
  { value: "royal_suite", label: "Royal Suite" },
  { value: "bond_suite", label: "Bond Suite" },
  { value: "pall_mall", label: "Pall Mall" },
  { value: "deluxe_suite", label: "Deluxe Suite" },
  { value: "deluxe_annex", label: "Deluxe Annex" },
  { value: "standard_suite", label: "Standard Suite" },
  { value: "little_gems", label: "Little Gems" },
  { value: "lg_resting_nook", label: "LG Resting Nook" },
  { value: "lg_grooming_room", label: "LG Grooming Room" },
  { value: "furrari_lounge", label: "Furrari Lounge" },
  { value: "grooming_room", label: "Grooming Room" },
  { value: "training_room", label: "Training Room" },
  { value: "kitchen", label: "Kitchen" },
];

const ROOM_TYPE_FILTER_OPTIONS: { value: string; label: string; types: string[] }[] = [
  { value: "__all__", label: "All Types", types: [] },
  { value: "presidential", label: "Presidential", types: ["presidential_super", "presidential_standard", "presidential_single", "presidential_double"] },
  { value: "royal_suite", label: "Royal Suite", types: ["royal_suite_single", "royal_suite_double", "single_royal", "double_royal", "royal_annex"] },
  { value: "deluxe", label: "Deluxe", types: ["deluxe"] },
  { value: "standard", label: "Standard", types: ["standard", "standard_glass"] },
  { value: "lg_royal", label: "LG Royal", types: ["lg_royal", "lg_royal_double"] },
  { value: "lg_deluxe", label: "LG Deluxe", types: ["lg_deluxe"] },
  { value: "lg_presidential", label: "LG Presidential", types: ["lg_presidential", "lg_presidential_double"] },
  { value: "lg_standard", label: "LG Standard", types: ["lg_standard", "lg_standard_luxury"] },
  { value: "family_room", label: "Family Room", types: ["family_room"] },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const emptyInsertDefaults = (): Omit<RoomInsert, "id" | "created_at"> => ({
  display_name: "",
  room_number: "",
  wing: "oxford",
  room_type: "single_royal",
  capacity_type: "single",
  max_pets: 1,
  is_active: true,
  camera_recording: false,
});

type RoomEditForm = {
  display_name: string;
  room_number: string;
  wing: RoomWing;
  room_type: RoomType;
  capacity_type: CapacityType;
  max_pets: number;
};

const EMPTY_EDIT_FORM: RoomEditForm = {
  display_name: "",
  room_number: "",
  wing: "oxford",
  room_type: "single_royal",
  capacity_type: "single",
  max_pets: MIN_MAX_PETS,
};

function roomToEditForm(room: Room): RoomEditForm {
  return {
    display_name: room.display_name,
    room_number: room.room_number,
    wing: room.wing,
    room_type: room.room_type,
    capacity_type: room.capacity_type,
    max_pets: clampMaxPets(room.max_pets ?? MIN_MAX_PETS),
  };
}

const RoomsAdminPage = () => {
  const { data: allRooms, isLoading, isError, error } = useAllRooms();
  const updateRoom = useUpdateRoom();
  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();
  const roomTypesQ = useRoomTypesQuery();
  const createRoomType = useCreateRoomType();

  const { roomTypeValues, roomTypeLabels } = useMemo(() => {
    const labels: Record<string, string> = { ...ROOM_TYPE_LABELS };
    const slugs = new Set<string>(ROOM_TYPE_VALUES);

    for (const rt of roomTypesQ.data ?? []) {
      labels[rt.slug] = rt.label;
      slugs.add(rt.slug);
    }

    for (const room of allRooms ?? []) {
      if (room.room_type && !slugs.has(room.room_type)) {
        slugs.add(room.room_type);
        labels[room.room_type] =
          labels[room.room_type] ?? room.room_type.replace(/_/g, " ");
      }
    }

    const values = Array.from(slugs).sort((a, b) =>
      (labels[a] ?? a).localeCompare(labels[b] ?? b),
    );

    return { roomTypeValues: values, roomTypeLabels: labels };
  }, [roomTypesQ.data, allRooms]);

  const rooms = useMemo(() => {
    if (!allRooms) return undefined;
    return allRooms.filter((r) => r.wing !== "cattery");
  }, [allRooms]);
  const [searchQuery, setSearchQuery] = useState("");
  const [wingFilter, setWingFilter] = useState("__all__");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [visibleCount, setVisibleCount] = useState(ROOMS_PAGE_SIZE);

  const { data: occupiedRoomIds } = useQuery({
    queryKey: ["rooms", "occupied-today"],
    queryFn: async () => {
      const today = todayISO();
      const { data, error } = await supabase
        .from("bookings")
        .select("room_id")
        .lte("check_in_date", today)
        .gte("check_out_date", today)
        .in("status", ["confirmed", "checked_in"]);
      if (error) throw error;
      return new Set((data ?? []).map((b) => b.room_id));
    },
    refetchInterval: 60_000,
  });

  const filteredRooms = useMemo(() => {
    if (!rooms) return undefined;
    let result = rooms;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((r) => {
        const name = r.display_name.toLowerCase();
        const wing = (WING_LABELS[r.wing as RoomWing] ?? r.wing).toLowerCase();
        const type = (roomTypeLabels[r.room_type] ?? r.room_type).toLowerCase();
        const num = r.room_number.toLowerCase();
        return name.includes(q) || wing.includes(q) || type.includes(q) || num.includes(q);
      });
    }
    if (wingFilter !== "__all__") {
      result = result.filter((r) => r.wing === wingFilter);
    }
    if (typeFilter !== "__all__") {
      const group = ROOM_TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter);
      if (group && group.types.length > 0) {
        result = result.filter((r) => group.types.includes(r.room_type));
      }
    }
    return result;
  }, [rooms, searchQuery, wingFilter, typeFilter, roomTypeLabels]);

  const visibleRooms = useMemo(
    () => (filteredRooms ?? []).slice(0, visibleCount),
    [filteredRooms, visibleCount],
  );

  const filteredRoomCount = filteredRooms?.length ?? 0;
  const hasMoreRooms = filteredRoomCount > visibleCount;

  useEffect(() => {
    setVisibleCount(ROOMS_PAGE_SIZE);
  }, [searchQuery, wingFilter, typeFilter]);

  const loadMore = useCallback(() => {
    setVisibleCount((c) => c + ROOMS_PAGE_SIZE);
  }, []);

  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  /**
   * Must mirror the input on every onChange. On blur, `e.currentTarget.value` can still reflect
   * the pre-commit DOM when the last keystroke and blur happen in the same frame (controlled input).
   */
  const latestEditDraftRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newRoom, setNewRoom] = useState(emptyInsertDefaults);

  const [addRoomTypeOpen, setAddRoomTypeOpen] = useState(false);
  const [newRoomTypeName, setNewRoomTypeName] = useState("");

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editForm, setEditForm] = useState<RoomEditForm>(EMPTY_EDIT_FORM);

  const [pendingDelete, setPendingDelete] = useState<Room | null>(null);

  const isEditing = useCallback(
    (id: string, field: string) =>
      editingCell?.id === id && editingCell?.field === field,
    [editingCell],
  );

  const startEdit = useCallback((room: Room, field: keyof Room, currentVal: string) => {
    setEditingCell({ id: room.id, field: field as string });
    setEditValue(currentVal);
    latestEditDraftRef.current = currentVal;
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback((id: string, field: string, raw: string, previous: Room) => {
    setEditingCell(null);

    let value: string | number | boolean | null = raw.trim() === "" ? null : raw.trim();

    if (field === "nightly_rate") {
      const normalized = raw.trim().replace(/,/g, "");
      const n = parseFloat(normalized);
      value = Number.isNaN(n) ? null : Math.max(0, n);
      const prev = previous.nightly_rate;
      if (value === null && (prev === null || prev === undefined)) return;
      if (
        typeof value === "number" &&
        prev !== null &&
        prev !== undefined &&
        Math.abs(value - prev) < 1e-9
      ) {
        return;
      }
    }

    updateRoom.mutate(
      { id, [field]: value },
      { onError: toastRoomSaveFailed },
    );
  }, [updateRoom]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, id: string, field: string) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      }
      if (e.key === "Escape") {
        setEditingCell(null);
      }
    },
    [],
  );

  const saveEnum = useCallback(
    <T extends string>(id: string, field: string, value: T) => {
      updateRoom.mutate(
        { id, [field]: value },
        { onError: toastRoomSaveFailed },
      );
    },
    [updateRoom],
  );

  const toggleActive = useCallback((room: Room) => {
    updateRoom.mutate(
      { id: room.id, is_active: !room.is_active },
      {
        onSuccess: () =>
          toast.success(
            !room.is_active
              ? `${room.display_name} is now active`
              : `${room.display_name} deactivated`,
          ),
        onError: toastRoomSaveFailed,
      },
    );
  }, [updateRoom]);

  const toggleCameraRecording = useCallback(
    (room: Room) => {
      const next = !(room.camera_recording ?? false);
      updateRoom.mutate(
        { id: room.id, camera_recording: next },
        { onError: toastRoomSaveFailed },
      );
    },
    [updateRoom],
  );

  const openEditRoom = useCallback((room: Room) => {
    setEditingRoom(room);
    setEditForm(roomToEditForm(room));
  }, []);

  const submitEditRoom = useCallback(() => {
    if (!editingRoom) return;
    const name = editForm.display_name.trim();
    const num = editForm.room_number.trim();
    if (!name || !num) {
      toast.error("Display name and room number are required.");
      return;
    }
    updateRoom.mutate(
      {
        id: editingRoom.id,
        display_name: name,
        room_number: num,
        wing: editForm.wing,
        room_type: editForm.room_type,
        capacity_type: editForm.capacity_type,
        max_pets: clampMaxPets(editForm.max_pets),
      },
      {
        onSuccess: () => {
          toast.success("Room updated");
          setEditingRoom(null);
          setEditForm(EMPTY_EDIT_FORM);
        },
        onError: toastRoomSaveFailed,
      },
    );
  }, [editingRoom, editForm, updateRoom]);

  const submitNewRoom = useCallback(() => {
    const name = newRoom.display_name?.trim();
    const num = newRoom.room_number?.trim();
    if (!name || !num) {
      toast.error("Display name and room number are required.");
      return;
    }
    createRoom.mutate(
      {
        ...newRoom,
        display_name: name,
        room_number: num,
      },
      {
        onSuccess: () => {
          toast.success("Room created");
          setAddOpen(false);
          setNewRoom(emptyInsertDefaults());
        },
        onError: (err) => {
          const msg = formatRoomMutationError(err);
          const hint = roomsSchemaMigrationHint(msg);
          toast.error(hint ?? msg, hint ? { duration: 12_000 } : undefined);
        },
      },
    );
  }, [newRoom, createRoom]);

  const submitAddRoomType = useCallback(() => {
    const name = newRoomTypeName.trim();
    if (!name) {
      toast.error("Room type name is required.");
      return;
    }
    createRoomType.mutate(name, {
      onSuccess: () => {
        toast.success("Room type added");
        setAddRoomTypeOpen(false);
        setNewRoomTypeName("");
      },
      onError: (err) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" &&
                err !== null &&
                "message" in err &&
                typeof (err as { message?: unknown }).message === "string"
              ? (err as { message: string }).message
              : "Could not add room type";
        toast.error(msg);
      },
    });
  }, [newRoomTypeName, createRoomType]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deleteRoom.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(`Deleted ${pendingDelete.display_name}`);
        setPendingDelete(null);
      },
      onError: (err) =>
        toast.error(formatRoomMutationError(err) || "Delete failed (room may have bookings)."),
    });
  }, [pendingDelete, deleteRoom]);

  const saveMaxPets = useCallback(
    (roomId: string, max_pets: number) => {
      updateRoom.mutate({ id: roomId, max_pets }, { onError: toastRoomSaveFailed });
    },
    [updateRoom],
  );

  const saveRoomColor = useCallback(
    (roomId: string, label_color: string | null) => {
      updateRoom.mutate(
        { id: roomId, label_color: normalizeHexColor(label_color) },
        { onError: toastRoomSaveFailed },
      );
    },
    [updateRoom],
  );

  const TextCell = ({
    room,
    field,
    value,
    type = "text",
    placeholder = "—",
    className,
  }: {
    room: Room;
    field: keyof Room;
    value: string | number | null;
    type?: "text" | "number";
    placeholder?: string;
    className?: string;
  }) => {
    const displayVal = value != null && value !== "" ? String(value) : null;

    if (isEditing(room.id, field as string)) {
      return (
        <input
          ref={inputRef}
          type={type}
          className={`w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${className ?? ""}`}
          value={editValue}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            latestEditDraftRef.current = v;
            setEditValue(v);
          }}
          onBlur={() => commitEdit(room.id, field as string, latestEditDraftRef.current, room)}
          onKeyDown={(e) => handleKeyDown(e, room.id, field as string)}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0" : undefined}
        />
      );
    }

    return (
      <span
        className={`block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted/60 transition-colors min-w-[60px] ${className ?? ""}`}
        onClick={() => startEdit(room, field, displayVal ?? "")}
        title="Click to edit"
      >
        {displayVal ?? <span className="text-muted-foreground">{placeholder}</span>}
      </span>
    );
  };

  const EnumCell = <T extends string>({
    room,
    field,
    value,
    options,
    labels,
  }: {
    room: Room;
    field: string;
    value: T;
    options: T[];
    labels: Record<T, string>;
  }) => (
    <Select value={value} onValueChange={(v) => saveEnum<T>(room.id, field, v as T)}>
      <SelectTrigger className="h-8 text-xs border-0 shadow-none px-1 focus:ring-1 min-w-[130px]">
        <SelectValue>{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {labels[opt]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const handleExport = useCallback(() => {
    const data = (filteredRooms ?? []).map((room) => ({
      "Room Name": room.display_name,
      "Room No": room.room_number,
      "Wing": WING_LABELS[room.wing as RoomWing] ?? room.wing,
      "Room Type": roomTypeLabels[room.room_type] ?? room.room_type,
      "Capacity": CAPACITY_LABELS[room.capacity_type as CapacityType] ?? room.capacity_type,
      "Max Pets": room.max_pets,
      "Status": occupiedRoomIds?.has(room.id) ? "Occupied" : "Available",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rooms");
    XLSX.writeFile(wb, `rooms-export-${todayISO()}.xlsx`);
  }, [filteredRooms, occupiedRoomIds, roomTypeLabels]);

  return (
    <>
      <TopBar title="Rooms" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Room Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click any cell to edit. Changes save automatically on blur. Use Add room to create a
              row, or delete to remove (only if no bookings reference the room).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={() => setAddRoomTypeOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room Type
            </Button>
            <Button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add room
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load rooms</AlertTitle>
            <AlertDescription>
              {roomsSchemaMigrationHint(formatRoomMutationError(error)) ??
                formatRoomMutationError(error)}
            </AlertDescription>
          </Alert>
        ) : !rooms || rooms.length === 0 ? (
          <p className="text-muted-foreground">No rooms found.</p>
        ) : (
          <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room name..."
              className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Select value={wingFilter} onValueChange={setWingFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Filter by Wing" />
              </SelectTrigger>
              <SelectContent>
                {WING_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Filter by Room Type" />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[180px]">Room name</TableHead>
                  <TableHead className="min-w-[88px] w-[88px] text-center">Color</TableHead>
                  <TableHead className="min-w-[88px] w-[88px] text-center">Room no.</TableHead>
                  <TableHead className="min-w-[150px]">Wing</TableHead>
                  <TableHead className="min-w-[190px]">Room Type</TableHead>
                  <TableHead className="min-w-[120px]">Capacity</TableHead>
                  <TableHead className="text-right min-w-[80px]">Max Pets</TableHead>
                  <TableHead className="min-w-[100px]">Camera No.</TableHead>
                  <TableHead className="text-center min-w-[120px]">Camera recording</TableHead>
                  <TableHead className="text-center min-w-[100px]">Status</TableHead>
                  <TableHead className="text-center min-w-[80px]">Active</TableHead>
                  <TableHead className="w-[88px]" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {visibleRooms.map((room) => {
                  const rowColor = normalizeHexColor(room.label_color);
                  return (
                  <TableRow
                    key={room.id}
                    className={room.is_active ? "" : "opacity-50 bg-muted/20"}
                    style={
                      rowColor
                        ? { boxShadow: `inset 4px 0 0 0 ${rowColor}` }
                        : undefined
                    }
                  >
                    <TableCell>
                      <span className="font-medium flex items-center gap-2 min-w-0">
                        {rowColor ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                            style={{ backgroundColor: rowColor }}
                            title={rowColor}
                          />
                        ) : null}
                        <TextCell
                          room={room}
                          field="display_name"
                          value={room.display_name}
                        />
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      <RoomColorCell room={room} onSave={saveRoomColor} />
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="inline-block min-w-[2.5rem] font-mono text-sm tabular-nums">
                        <TextCell room={room} field="room_number" value={room.room_number} />
                      </span>
                    </TableCell>

                    <TableCell>
                      <EnumCell<RoomWing>
                        room={room}
                        field="wing"
                        value={room.wing}
                        options={WING_VALUES}
                        labels={WING_LABELS}
                      />
                    </TableCell>

                    <TableCell>
                      <EnumCell
                        room={room}
                        field="room_type"
                        value={room.room_type}
                        options={roomTypeValues}
                        labels={roomTypeLabels}
                      />
                    </TableCell>

                    <TableCell>
                      <EnumCell<CapacityType>
                        room={room}
                        field="capacity_type"
                        value={room.capacity_type}
                        options={CAPACITY_VALUES}
                        labels={CAPACITY_LABELS}
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <MaxPetsCell
                        room={room}
                        isEditing={isEditing(room.id, "max_pets")}
                        onOpen={() => setEditingCell({ id: room.id, field: "max_pets" })}
                        onClose={() => setEditingCell(null)}
                        onSave={saveMaxPets}
                      />
                    </TableCell>


                    <TableCell>
                      <TextCell room={room} field="cam_number" value={room.cam_number} />
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-2">
                        <Switch
                          checked={room.camera_recording ?? false}
                          onCheckedChange={() => toggleCameraRecording(room)}
                          aria-label={`Camera recording for ${room.display_name}`}
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {room.camera_recording ? "Yes" : "No"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      {occupiedRoomIds?.has(room.id) ? (
                        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100 text-[10px] px-1.5">
                          Occupied
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 bg-muted text-muted-foreground border-muted-foreground/30">
                          Available
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Switch
                          checked={room.is_active}
                          onCheckedChange={() => toggleActive(room)}
                          aria-label={`Toggle ${room.display_name} active`}
                        />
                        {!room.is_active && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 bg-muted text-muted-foreground border-muted-foreground/30"
                          >
                            Off
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edit ${room.display_name}`}
                          onClick={() => openEditRoom(room)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Delete ${room.display_name}`}
                          onClick={() => setPendingDelete(room)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredRoomCount > 0 && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {visibleRooms.length} of {filteredRoomCount} room
                {filteredRoomCount === 1 ? "" : "s"}
              </p>
              {hasMoreRooms && (
                <Button type="button" variant="outline" onClick={loadMore}>
                  Load more
                </Button>
              )}
            </div>
          )}
          </>
        )}

        <Dialog
          open={!!editingRoom}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRoom(null);
              setEditForm(EMPTY_EDIT_FORM);
            }
          }}
        >
          <DialogContent className="sm:max-w-md print-sans">
            <DialogHeader>
              <DialogTitle>Edit room</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="er-name">Display name</Label>
                <Input
                  id="er-name"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="er-num">Room number</Label>
                <Input
                  id="er-num"
                  value={editForm.room_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, room_number: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Wing</Label>
                <Select
                  value={editForm.wing}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, wing: v as RoomWing }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WING_VALUES.map((w) => (
                      <SelectItem key={w} value={w}>
                        {WING_LABELS[w]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Room type</Label>
                <Select
                  value={editForm.room_type}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, room_type: v as RoomType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypeValues.map((t) => (
                      <SelectItem key={t} value={t}>
                        {roomTypeLabels[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Capacity</Label>
                <Select
                  value={editForm.capacity_type}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, capacity_type: v as CapacityType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPACITY_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CAPACITY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="er-max">Max pets</Label>
                <Input
                  id="er-max"
                  type="number"
                  inputMode="numeric"
                  min={MIN_MAX_PETS}
                  max={MAX_MAX_PETS}
                  step={1}
                  value={editForm.max_pets}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      max_pets: clampMaxPets(parseInt(e.target.value, 10) || MIN_MAX_PETS),
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingRoom(null);
                  setEditForm(EMPTY_EDIT_FORM);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={submitEditRoom} disabled={updateRoom.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md print-sans">
            <DialogHeader>
              <DialogTitle>Add room</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="nr-name">Display name</Label>
                <Input
                  id="nr-name"
                  value={newRoom.display_name}
                  onChange={(e) => setNewRoom((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. Bond Suite 1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nr-num">Room number</Label>
                <Input
                  id="nr-num"
                  value={newRoom.room_number}
                  onChange={(e) => setNewRoom((f) => ({ ...f, room_number: e.target.value }))}
                  placeholder="e.g. 1"
                />
              </div>
              <div className="grid gap-2">
                <Label>Wing</Label>
                <Select
                  value={newRoom.wing}
                  onValueChange={(v) => setNewRoom((f) => ({ ...f, wing: v as RoomWing }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WING_VALUES.map((w) => (
                      <SelectItem key={w} value={w}>
                        {WING_LABELS[w]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Room type</Label>
                <Select
                  value={newRoom.room_type}
                  onValueChange={(v) =>
                    setNewRoom((f) => ({ ...f, room_type: v as RoomType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypeValues.map((t) => (
                      <SelectItem key={t} value={t}>
                        {roomTypeLabels[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Capacity</Label>
                <Select
                  value={newRoom.capacity_type}
                  onValueChange={(v) =>
                    setNewRoom((f) => ({ ...f, capacity_type: v as CapacityType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPACITY_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CAPACITY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Pet Type</Label>
                <Select
                  value={newRoom.pet_type ?? "dog"}
                  onValueChange={(v) => setNewRoom((f) => ({ ...f, pet_type: v as RoomPetType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nr-max">Max pets</Label>
                <Input
                  id="nr-max"
                  type="number"
                  inputMode="numeric"
                  min={MIN_MAX_PETS}
                  max={MAX_MAX_PETS}
                  step={1}
                  value={newRoom.max_pets ?? MIN_MAX_PETS}
                  onChange={(e) =>
                    setNewRoom((f) => ({
                      ...f,
                      max_pets: clampMaxPets(parseInt(e.target.value, 10) || MIN_MAX_PETS),
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <Label htmlFor="nr-cam" className="cursor-pointer shrink-0">
                  Camera recording
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {newRoom.camera_recording ? "Yes" : "No"}
                  </span>
                  <Switch
                    id="nr-cam"
                    checked={!!newRoom.camera_recording}
                    onCheckedChange={(v) => setNewRoom((f) => ({ ...f, camera_recording: v }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={submitNewRoom} disabled={createRoom.isPending}>
                Create room
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={addRoomTypeOpen}
          onOpenChange={(open) => {
            setAddRoomTypeOpen(open);
            if (!open) setNewRoomTypeName("");
          }}
        >
          <DialogContent className="sm:max-w-md print-sans">
            <DialogHeader>
              <DialogTitle>Add room type</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="rt-name">Room type name</Label>
                <Input
                  id="rt-name"
                  value={newRoomTypeName}
                  onChange={(e) => setNewRoomTypeName(e.target.value)}
                  placeholder="e.g. Garden Suite"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitAddRoomType();
                    }
                  }}
                  disabled={createRoomType.isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddRoomTypeOpen(false);
                  setNewRoomTypeName("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitAddRoomType}
                disabled={!newRoomTypeName.trim() || createRoomType.isPending}
              >
                {createRoomType.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete room?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. If bookings reference this room, deletion will fail.
                {pendingDelete ? (
                  <>
                    {" "}
                    <span className="font-medium text-foreground">{pendingDelete.display_name}</span>
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </>
  );
};

export default RoomsAdminPage;
