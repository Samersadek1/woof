/**
 * RoomsAdmin — /settings/rooms
 *
 * Inline-editable table of all rooms. Each cell can be clicked to edit.
 * Text / number fields save on blur or Enter. Enum select fields save on
 * change. Active and Camera recording toggles save immediately.
 */

import { useState, useRef, useMemo, KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import {
  useAllRooms,
  useUpdateRoom,
  useCreateRoom,
  useDeleteRoom,
} from "@/hooks/useBookings";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];
type RoomInsert = Database["public"]["Tables"]["rooms"]["Insert"];
type RoomWing = Database["public"]["Enums"]["room_wing"];
type RoomType = Database["public"]["Enums"]["room_type"];
type CapacityType = Database["public"]["Enums"]["capacity_type"];

// ── Display labels ────────────────────────────────────────────────────────────

const WING_LABELS: Record<RoomWing, string> = {
  oxford: "Oxford Street",
  piccadilly: "Piccadilly",
  park_lane: "Park Lane",
  fleet: "Fleet Street",
  back_kennels: "Back Kennels",
  cattery: "Cat boarding (wing)",
  grooming_upstairs: "Grooming Upstairs",
  bond_rooms: "Bond Rooms",
  dluxe: "Dluxe",
  standard_room: "Standard Room",
};

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  presidential_super: "Presidential Super",
  presidential_standard: "Presidential Standard",
  royal_suite_double: "Royal Suite Double",
  royal_suite_single: "Royal Suite Single",
  double_royal: "Double Royal",
  single_royal: "Single Royal",
  family_room: "Family Room",
  royal_annex: "Royal Annex",
  cattery_super_presidential: "Cattery Super Presidential",
  cattery_presidential: "Cattery Presidential",
  cattery_deluxe: "Cattery Deluxe",
  park_lane: "Park Lane",
  pall_mall: "Pall Mall",
  kennels: "Back Kennels",
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
  "cattery",
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
  "cattery_super_presidential",
  "cattery_presidential",
  "cattery_deluxe",
];

const CAPACITY_VALUES: CapacityType[] = ["single", "twin", "twin_plus", "multiple"];

// ── Editable cell helpers ─────────────────────────────────────────────────────

type EditingCell = { id: string; field: string } | null;

type Species = "dog" | "cat";

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

function roomsCameraRecordingMigrationHint(message: string): string | null {
  const m = message.toLowerCase();
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
  const hint = roomsCameraRecordingMigrationHint(msg);
  toast.error(hint ?? `Save failed: ${msg}`, hint ? { duration: 12_000 } : undefined);
}

const DOG_WINGS: RoomWing[] = [
  "bond_rooms",
  "dluxe",
  "standard_room",
  "oxford",
  "piccadilly",
  "park_lane",
  "fleet",
  "back_kennels",
];
const CAT_WINGS: RoomWing[] = ["cattery"];

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

const RoomsAdminPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSpecies: Species = searchParams.get("species") === "cat" ? "cat" : "dog";
  const [species, setSpecies] = useState<Species>(initialSpecies);

  const { data: allRooms, isLoading } = useAllRooms();
  const updateRoom = useUpdateRoom();
  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();

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

  const [addOpen, setAddOpen] = useState(false);
  const [newRoom, setNewRoom] = useState(emptyInsertDefaults);

  const [pendingDelete, setPendingDelete] = useState<Room | null>(null);

  const isEditing = (id: string, field: string) =>
    editingCell?.id === id && editingCell?.field === field;

  const startEdit = (room: Room, field: keyof Room, currentVal: string) => {
    setEditingCell({ id: room.id, field: field as string });
    setEditValue(currentVal);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = (id: string, field: string, raw: string) => {
    setEditingCell(null);

    let value: string | number | boolean | null = raw.trim() === "" ? null : raw.trim();

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
      { onError: toastRoomSaveFailed },
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
      { onError: toastRoomSaveFailed },
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
              : `${room.display_name} deactivated`,
          ),
        onError: toastRoomSaveFailed,
      },
    );
  };

  const toggleCameraRecording = (room: Room) => {
    const next = !(room.camera_recording ?? false);
    updateRoom.mutate(
      { id: room.id, camera_recording: next },
      { onError: toastRoomSaveFailed },
    );
  };

  const submitNewRoom = () => {
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
          const hint = roomsCameraRecordingMigrationHint(msg);
          toast.error(hint ?? msg, hint ? { duration: 12_000 } : undefined);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteRoom.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(`Deleted ${pendingDelete.display_name}`);
        setPendingDelete(null);
      },
      onError: (err) =>
        toast.error(formatRoomMutationError(err) || "Delete failed (room may have bookings)."),
    });
  };

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
        className={`block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted/60 transition-colors min-w-[60px] ${className ?? ""}`}
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
            <Button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add room
            </Button>
            <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
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
                  <TableHead className="min-w-[180px]">Room name</TableHead>
                  <TableHead className="min-w-[88px] w-[88px] text-center">Room no.</TableHead>
                  <TableHead className="min-w-[150px]">Wing</TableHead>
                  <TableHead className="min-w-[190px]">Room Type</TableHead>
                  <TableHead className="min-w-[120px]">Capacity</TableHead>
                  <TableHead className="text-right min-w-[80px]">Max Pets</TableHead>
                  <TableHead className="text-right min-w-[120px]">Nightly Rate (AED)</TableHead>
                  <TableHead className="min-w-[100px]">Camera No.</TableHead>
                  <TableHead className="text-center min-w-[120px]">Camera recording</TableHead>
                  <TableHead className="text-center min-w-[80px]">Active</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {rooms.map((room) => (
                  <TableRow
                    key={room.id}
                    className={room.is_active ? "" : "opacity-50 bg-muted/20"}
                  >
                    <TableCell>
                      <span className="font-medium">
                        <TextCell
                          room={room}
                          field="display_name"
                          value={room.display_name}
                        />
                      </span>
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
                      <EnumCell<RoomType>
                        room={room}
                        field="room_type"
                        value={room.room_type}
                        options={ROOM_TYPE_VALUES}
                        labels={ROOM_TYPE_LABELS}
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
                      <TextCell room={room} field="max_pets" value={room.max_pets} type="number" />
                    </TableCell>

                    <TableCell className="text-right">
                      <TextCell
                        room={room}
                        field="nightly_rate"
                        value={room.nightly_rate}
                        type="number"
                        placeholder="—"
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

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
                  onValueChange={(v) => setNewRoom((f) => ({ ...f, room_type: v as RoomType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPE_VALUES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ROOM_TYPE_LABELS[t]}
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
                <Label htmlFor="nr-max">Max pets</Label>
                <Input
                  id="nr-max"
                  type="number"
                  min={1}
                  value={newRoom.max_pets ?? 1}
                  onChange={(e) =>
                    setNewRoom((f) => ({
                      ...f,
                      max_pets: Math.max(1, parseInt(e.target.value, 10) || 1),
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
