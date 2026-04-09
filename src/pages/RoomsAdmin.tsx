/**
 * RoomsAdmin — /settings/rooms
 *
 * Inline-editable table of all rooms. Each cell can be clicked to edit.
 * Text / number fields save on blur or Enter. Enum select fields save on
 * change. The Active toggle saves immediately.
 */

import { useState, useRef, useMemo, KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useAllRooms, useUpdateRoom } from "@/hooks/useBookings";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];
type RoomWing = Database["public"]["Enums"]["room_wing"];
type RoomType = Database["public"]["Enums"]["room_type"];
type CapacityType = Database["public"]["Enums"]["capacity_type"];

// ── Display labels ────────────────────────────────────────────────────────────

const WING_LABELS: Record<RoomWing, string> = {
  oxford:           "Oxford Street",
  piccadilly:       "Piccadilly",
  park_lane:        "Park Lane",
  fleet:            "Fleet Street",
  back_kennels:     "Back Kennels",
  cattery:          "Cat boarding (wing)",
  grooming_upstairs:"Grooming Upstairs",
};

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  presidential_super:           "Presidential Super",
  presidential_standard:        "Presidential Standard",
  royal_suite_double:           "Royal Suite Double",
  royal_suite_single:           "Royal Suite Single",
  double_royal:                 "Double Royal",
  single_royal:                 "Single Royal",
  family_room:                  "Family Room",
  royal_annex:                  "Royal Annex",
  cattery_super_presidential:   "Cattery Super Presidential",
  cattery_presidential:         "Cattery Presidential",
  cattery_deluxe:               "Cattery Deluxe",
};

const CAPACITY_LABELS: Record<CapacityType, string> = {
  single:     "Single",
  twin:       "Twin",
  twin_plus:  "Twin+",
  multiple:   "Multiple",
};

const WING_VALUES: RoomWing[] = [
  "oxford", "piccadilly", "park_lane", "fleet",
  "back_kennels", "cattery", "grooming_upstairs",
];

const ROOM_TYPE_VALUES: RoomType[] = [
  "presidential_super", "presidential_standard",
  "royal_suite_double", "royal_suite_single",
  "double_royal", "single_royal", "family_room",
  "royal_annex", "cattery_super_presidential",
  "cattery_presidential", "cattery_deluxe",
];

const CAPACITY_VALUES: CapacityType[] = ["single", "twin", "twin_plus", "multiple"];

// ── Editable cell helpers ─────────────────────────────────────────────────────

type EditingCell = { id: string; field: string } | null;

// ── Main component ────────────────────────────────────────────────────────────

type Species = "dog" | "cat";

const DOG_WINGS: RoomWing[] = ["oxford", "piccadilly", "park_lane", "fleet", "back_kennels"];
const CAT_WINGS: RoomWing[] = ["cattery"];

const RoomsAdminPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSpecies: Species = searchParams.get("species") === "cat" ? "cat" : "dog";
  const [species, setSpecies] = useState<Species>(initialSpecies);

  const { data: allRooms, isLoading } = useAllRooms();
  const updateRoom = useUpdateRoom();

  const rooms = useMemo(() => {
    if (!allRooms) return undefined;
    const wings = species === "cat" ? CAT_WINGS : DOG_WINGS;
    return allRooms.filter((r) => wings.includes(r.wing));
  }, [allRooms, species]);

  const handleSpeciesChange = (s: Species) => {
    setSpecies(s);
    setSearchParams({ species: s }, { replace: true });
  };

  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = (id: string, field: string) =>
    editingCell?.id === id && editingCell?.field === field;

  const startEdit = (room: Room, field: keyof Room, currentVal: string) => {
    setEditingCell({ id: room.id, field: field as string });
    setEditValue(currentVal);
    // Let the input render before focusing
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = (id: string, field: string, raw: string) => {
    setEditingCell(null);

    let value: string | number | null = raw.trim() === "" ? null : raw.trim();

    // Coerce numeric fields
    if (field === "max_pets") {
      const n = parseInt(raw, 10);
      value = isNaN(n) ? 1 : Math.max(1, n);
    }
    if (field === "nightly_rate") {
      const n = parseFloat(raw);
      value = isNaN(n) ? null : Math.max(0, n);
    }

    updateRoom.mutate(
      { id, [field]: value },
      { onError: (err) => toast.error("Save failed: " + err.message) }
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, id: string, field: string) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const saveEnum = <T extends string>(id: string, field: string, value: T) => {
    updateRoom.mutate(
      { id, [field]: value },
      { onError: (err) => toast.error("Save failed: " + err.message) }
    );
  };

  const toggleActive = (room: Room) => {
    updateRoom.mutate(
      { id: room.id, is_active: !room.is_active },
      {
        onSuccess: () =>
          toast.success(
            !room.is_active
              ? `${room.display_name} is now active`
              : `${room.display_name} deactivated`
          ),
        onError: (err) => toast.error("Save failed: " + err.message),
      }
    );
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const TextCell = ({
    room,
    field,
    value,
    type = "text",
    placeholder = "—",
  }: {
    room: Room;
    field: keyof Room;
    value: string | number | null;
    type?: "text" | "number";
    placeholder?: string;
  }) => {
    const displayVal = value != null && value !== "" ? String(value) : null;

    if (isEditing(room.id, field as string)) {
      return (
        <input
          ref={inputRef}
          type={type}
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(room.id, field as string, editValue)}
          onKeyDown={(e) => handleKeyDown(e, room.id, field as string)}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0" : undefined}
        />
      );
    }

    return (
      <span
        className="block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted/60 transition-colors min-w-[60px]"
        onClick={() => startEdit(room, field, displayVal ?? "")}
        title="Click to edit"
      >
        {displayVal ?? <span className="text-muted-foreground">—</span>}
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
    <Select
      value={value}
      onValueChange={(v) => saveEnum<T>(room.id, field, v as T)}
    >
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

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <TopBar title="Rooms" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Room Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click any cell to edit. Changes save automatically on blur.
              Toggling Active removes the room from the boarding calendar.
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium shrink-0">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${species === "dog" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => handleSpeciesChange("dog")}
            >
              Dogs
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${species === "cat" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              onClick={() => handleSpeciesChange("cat")}
            >
              Cats
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rooms || rooms.length === 0 ? (
          <p className="text-muted-foreground">No rooms found.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[160px]">Display Name</TableHead>
                  <TableHead className="min-w-[150px]">Wing</TableHead>
                  <TableHead className="min-w-[190px]">Room Type</TableHead>
                  <TableHead className="min-w-[120px]">Capacity</TableHead>
                  <TableHead className="text-right min-w-[80px]">Max Pets</TableHead>
                  <TableHead className="text-right min-w-[120px]">Nightly Rate (AED)</TableHead>
                  <TableHead className="min-w-[100px]">Camera No.</TableHead>
                  <TableHead className="text-center min-w-[80px]">Active</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rooms.map((room) => (
                  <TableRow
                    key={room.id}
                    className={room.is_active ? "" : "opacity-50 bg-muted/20"}
                  >
                    {/* Display Name */}
                    <TableCell className="font-medium">
                      <TextCell room={room} field="display_name" value={room.display_name} />
                    </TableCell>

                    {/* Wing */}
                    <TableCell>
                      <EnumCell<RoomWing>
                        room={room}
                        field="wing"
                        value={room.wing}
                        options={WING_VALUES}
                        labels={WING_LABELS}
                      />
                    </TableCell>

                    {/* Room Type */}
                    <TableCell>
                      <EnumCell<RoomType>
                        room={room}
                        field="room_type"
                        value={room.room_type}
                        options={ROOM_TYPE_VALUES}
                        labels={ROOM_TYPE_LABELS}
                      />
                    </TableCell>

                    {/* Capacity */}
                    <TableCell>
                      <EnumCell<CapacityType>
                        room={room}
                        field="capacity_type"
                        value={room.capacity_type}
                        options={CAPACITY_VALUES}
                        labels={CAPACITY_LABELS}
                      />
                    </TableCell>

                    {/* Max Pets */}
                    <TableCell className="text-right">
                      <TextCell room={room} field="max_pets" value={room.max_pets} type="number" />
                    </TableCell>

                    {/* Nightly Rate */}
                    <TableCell className="text-right">
                      <TextCell
                        room={room}
                        field="nightly_rate"
                        value={room.nightly_rate}
                        type="number"
                        placeholder="—"
                      />
                    </TableCell>

                    {/* Camera Number */}
                    <TableCell>
                      <TextCell room={room} field="cam_number" value={room.cam_number} />
                    </TableCell>

                    {/* Active toggle */}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  );
};

export default RoomsAdminPage;
