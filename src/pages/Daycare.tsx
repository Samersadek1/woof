import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { ownerDisplayName, createServiceInvoice } from "@/lib/bookingUtils";
import { buildDaycareTags, tagToneClass } from "@/lib/operationsTags";
import {
  TRANSPORT_PRICING_KEYS,
  TRANSPORT_ZONE_OPTIONS,
  type TransportZone,
  privateDubaiOverCapacity,
  transportPricingKey,
  transportQuantityForPets,
  transportZoneLabel,
} from "@/lib/transportPricing";
import {
  buildPriceMap,
  daycareGroupPricing,
  daycareHourlyLinearTotal,
  DAYCARE_HOURLY_UNIT_KEY,
} from "@/lib/servicePricing";
import { grandTotalFromNet, vatAmountFromNet, vatLineLabel } from "@/lib/vatConfig";
import { useOwners, useOwner } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useDaycarePackages,
  useConsumeServiceCredit,
  useSessionsByPackage,
  useAddDaycareDay,
  useUpdateDaycareSession,
  useRescheduleDaycareSession,
  useDeleteDaycareSession,
  type DaycarePackage,
  type SessionRow,
} from "@/hooks/useDaycare";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { DogSizeField } from "@/components/DogSizeField";
import { DEFAULT_DOG_SIZE, type DogSizeFormValue } from "@/lib/dogSizeForm";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarDays,
  Search,
  Printer,
  Plus,
  Pencil,
  Trash2,
  Check,
  ChevronsUpDown,
  X,
  Loader2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY = format(new Date(), "yyyy-MM-dd");

const LOGGED_BY_OPTIONS = [
  "Mariel",
  "Lilian",
  "Judy",
  "Darilyn",
  "Mitch",
  "Jovy",
  "Melissa",
] as const;

function creditColour(remaining: number) {
  if (remaining <= 1) return "text-red-600";
  if (remaining <= 3) return "text-amber-600";
  return "text-emerald-600";
}

function creditBarColour(remaining: number) {
  if (remaining <= 1) return "bg-red-500";
  if (remaining <= 3) return "bg-amber-500";
  return "bg-emerald-500";
}

// ── Shared: OwnerCombobox ─────────────────────────────────────────────────────

interface OwnerComboboxProps {
  selectedId:    string | null;
  selectedLabel: string | null;
  onSelect:      (id: string, label: string) => void;
  onClear:       () => void;
  placeholder?:  string;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }
  return "Unknown error";
}

function OwnerCombobox({
  selectedId, selectedLabel, onSelect, onClear, placeholder = "Search client or pet name / phone…",
}: OwnerComboboxProps) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const wrapperRef          = useRef<HTMLDivElement>(null);

  const { data: owners, isLoading } = useOwners(query.length >= 1 ? query : undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedId && selectedLabel) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="flex-1 font-medium">{selectedLabel}</span>
        <button type="button" onClick={onClear} className="rounded-full hover:bg-muted p-0.5">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        className="pl-8 h-9"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-2 space-y-1">
              {[1, 2].map(i => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          ) : !owners?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No clients or pets found</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto divide-y">
              {owners.map(o => {
                const label = ownerDisplayName(o.first_name, o.last_name);
                const petCount = o.pets?.length ?? 0;
                const petNames = (o.pets ?? []).map((p) => p.name).filter(Boolean).join(", ");
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/60 text-left"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(o.id, label);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {petCount} pet{petCount !== 1 ? "s" : ""}{petNames ? ` · ${petNames}` : ""}{o.phone ? ` · ${o.phone}` : ""}
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

// ── Planner: SessionsTable ────────────────────────────────────────────────────

interface SessionsTableProps {
  sessions:  SessionRow[];
  packageId: string;
  petId:     string;
  ownerId:   string;
  isLoading: boolean;
}

function SessionsTable({ sessions, packageId, petId, ownerId, isLoading }: SessionsTableProps) {
  const updateSession = useUpdateDaycareSession();
  const rescheduleSession = useRescheduleDaycareSession();
  const deleteSession = useDeleteDaycareSession();
  const addDay        = useAddDaycareDay();

  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editDraft,  setEditDraft]  = useState({ pickup_used: false, dropoff_used: false, logged_by: "", remark: "" });
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [addDraft,   setAddDraft]   = useState({ session_date: TODAY, pickup_used: false, dropoff_used: false, logged_by: "", remark: "" });
  const [dateEditSession, setDateEditSession] = useState<SessionRow | null>(null);
  const [dateEditValue, setDateEditValue] = useState("");

  const startEdit = (s: SessionRow) => {
    setEditingId(s.id);
    setEditDraft({
      pickup_used:  s.pickup_used  ?? false,
      dropoff_used: s.dropoff_used ?? false,
      logged_by:    s.logged_by    ?? "",
      remark:       s.notes        ?? "",
    });
  };

  const commitEdit = () => {
    if (!editingId) return;
    updateSession.mutate({
      sessionId:    editingId,
      pickup_used:  editDraft.pickup_used,
      dropoff_used: editDraft.dropoff_used,
      logged_by:    editDraft.logged_by  || null,
      remark:       editDraft.remark     || null,
    }, {
      onSuccess: () => { toast.success("Session updated"); setEditingId(null); },
      onError:   (err) => toast.error(err.message),
    });
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteSession.mutate({ sessionId: deleteId, package_id: packageId }, {
      onSuccess: () => { toast.success("Session removed"); setDeleteId(null); },
      onError:   (err) => toast.error(err.message),
    });
  };

  const submitAdd = () => {
    addDay.mutate({
      session_date: addDraft.session_date,
      pet_id:       petId,
      owner_id:     ownerId,
      package_id:   packageId,
      pickup_used:  addDraft.pickup_used,
      dropoff_used: addDraft.dropoff_used,
      logged_by:    addDraft.logged_by || null,
      remark:       addDraft.remark    || null,
    }, {
      onSuccess: () => {
        toast.success("Day added");
        setAddOpen(false);
        setAddDraft({ session_date: TODAY, pickup_used: false, dropoff_used: false, logged_by: "", remark: "" });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  if (isLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead className="min-w-[140px]">Date</TableHead>
              <TableHead className="text-center w-20">Pickup</TableHead>
              <TableHead className="text-center w-20">Drop-off</TableHead>
              <TableHead className="min-w-[110px]">By</TableHead>
              <TableHead className="min-w-[150px]">Remark</TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sessions.length === 0 && !addOpen && (
              <TableRow>
                <TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">
                  No sessions recorded yet
                </TableCell>
              </TableRow>
            )}

            {sessions.map((s, idx) => {
              const isEditing = editingId === s.id;
              return (
                <TableRow key={s.id} className={isEditing ? "bg-muted/20" : ""}>
                  {/* # */}
                  <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>

                  {/* Date + reschedule */}
                  <TableCell className="text-sm whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{format(parseISO(s.session_date), "d MMM yyyy")}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                        title="Change session date"
                        disabled={isEditing}
                        onClick={() => {
                          setDateEditSession(s);
                          setDateEditValue(s.session_date);
                        }}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>

                  {/* Pickup */}
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Checkbox
                        checked={editDraft.pickup_used}
                        onCheckedChange={(v) => setEditDraft(d => ({ ...d, pickup_used: v === true }))}
                      />
                    ) : s.pickup_used ? (
                      <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                    ) : null}
                  </TableCell>

                  {/* Drop-off */}
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Checkbox
                        checked={editDraft.dropoff_used}
                        onCheckedChange={(v) => setEditDraft(d => ({ ...d, dropoff_used: v === true }))}
                      />
                    ) : s.dropoff_used ? (
                      <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                    ) : null}
                  </TableCell>

                  {/* By */}
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editDraft.logged_by}
                        onChange={(e) => setEditDraft(d => ({ ...d, logged_by: e.target.value }))}
                        className="h-7 text-xs"
                        placeholder="Name"
                      />
                    ) : (
                      <span className="text-sm">{s.logged_by || <span className="text-muted-foreground">—</span>}</span>
                    )}
                  </TableCell>

                  {/* Remark */}
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editDraft.remark}
                        onChange={(e) => setEditDraft(d => ({ ...d, remark: e.target.value }))}
                        className="h-7 text-xs"
                        placeholder="Remark"
                      />
                    ) : (
                      <span className="text-sm">{s.notes || <span className="text-muted-foreground">—</span>}</span>
                    )}
                  </TableCell>

                  {/* Edit / Save */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                          disabled={updateSession.isPending}
                          onClick={commitEdit}
                        >
                          {updateSession.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>

                  {/* Delete */}
                  <TableCell>
                    {!isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Add Day row */}
            {addOpen ? (
              <TableRow className="bg-emerald-50/50">
                <TableCell className="text-center text-xs text-muted-foreground">+</TableCell>
                <TableCell>
                  <Input
                    type="date"
                    value={addDraft.session_date}
                    onChange={(e) => setAddDraft(d => ({ ...d, session_date: e.target.value }))}
                    className="h-7 text-xs w-36"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={addDraft.pickup_used}
                    onCheckedChange={(v) => setAddDraft(d => ({ ...d, pickup_used: v === true }))}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={addDraft.dropoff_used}
                    onCheckedChange={(v) => setAddDraft(d => ({ ...d, dropoff_used: v === true }))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={addDraft.logged_by}
                    onChange={(e) => setAddDraft(d => ({ ...d, logged_by: e.target.value }))}
                    className="h-7 text-xs"
                    placeholder="Name"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={addDraft.remark}
                    onChange={(e) => setAddDraft(d => ({ ...d, remark: e.target.value }))}
                    className="h-7 text-xs"
                    placeholder="Remark"
                  />
                </TableCell>
                <TableCell colSpan={2}>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                      disabled={addDay.isPending}
                      onClick={submitAdd}
                    >
                      {addDay.isPending
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setAddOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow className="border-t-2 border-dashed border-muted">
                <TableCell colSpan={8}>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Day
                  </button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!dateEditSession}
        onOpenChange={(open) => {
          if (!open) {
            setDateEditSession(null);
            setDateEditValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change session date</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Use this when the visit was cancelled or moved to another day. Package day counts are
              unchanged.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reschedule-session-date">Session date</Label>
              <Input
                id="reschedule-session-date"
                type="date"
                value={dateEditValue}
                onChange={(e) => setDateEditValue(e.target.value)}
                className="w-full max-w-[240px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDateEditSession(null);
                setDateEditValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !dateEditSession ||
                !dateEditValue ||
                rescheduleSession.isPending
              }
              onClick={() => {
                if (!dateEditSession || !dateEditValue.trim()) return;
                rescheduleSession.mutate(
                  {
                    sessionId: dateEditSession.id,
                    petId,
                    session_date: dateEditValue.trim(),
                  },
                  {
                    onSuccess: () => {
                      toast.success("Session date updated");
                      setDateEditSession(null);
                      setDateEditValue("");
                    },
                    onError: (err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Could not update date",
                      ),
                  },
                );
              }}
            >
              {rescheduleSession.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the session and decrement the package's used day count by 1. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSession.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSession.isPending}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
            >
              {deleteSession.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
                : "Remove session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── TAB 1: PlannerTab ─────────────────────────────────────────────────────────

function syncPlannerSearchParams(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  owner: string | null,
  pkg: string | null
) {
  setSearchParams(
    (prev) => {
      const n = new URLSearchParams(prev);
      n.set("tab", "planner");
      if (owner) n.set("ownerId", owner);
      else n.delete("ownerId");
      if (pkg) n.set("packageId", pkg);
      else n.delete("packageId");
      return n;
    },
    { replace: true }
  );
}

function PlannerTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerIdParam = searchParams.get("ownerId");
  const packageIdParam = searchParams.get("packageId");

  const [ownerId, setOwnerId] = useState<string | null>(ownerIdParam);
  const [packageId, setPackageId] = useState<string | null>(packageIdParam);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [billingChoiceByPet, setBillingChoiceByPet] = useState<Record<string, string>>({});
  const [skipInvoiceDiscount, setSkipInvoiceDiscount] = useState(false);
  const [hourlyDogsInput, setHourlyDogsInput] = useState("");
  const [hourlyDogsTouched, setHourlyDogsTouched] = useState(false);
  const [hourlyHoursInput, setHourlyHoursInput] = useState("");
  const [hourlyHoursTouched, setHourlyHoursTouched] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState({
    session_date: TODAY,
    pickup_used: false,
    dropoff_used: false,
    transport_zone: "dubai_shared" as TransportZone,
    logged_by: "",
    remark: "",
    dog_size: DEFAULT_DOG_SIZE as DogSizeFormValue,
  });
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);

  useEffect(() => {
    setOwnerId(ownerIdParam);
    setPackageId(packageIdParam);
  }, [ownerIdParam, packageIdParam]);

  const { data: ownerFromUrl, isLoading: ownerDetailLoading } = useOwner(
    ownerId ?? ""
  );

  const resolvedOwnerLabel =
    ownerFromUrl?.id === ownerId
      ? ownerDisplayName(ownerFromUrl.first_name, ownerFromUrl.last_name)
      : null;

  const { data: pets } = usePets(ownerId ?? "");
  const { data: packages } = useDaycarePackages(ownerId ?? "");
  const addDay = useAddDaycareDay();
  const consumeCredit = useConsumeServiceCredit();
  const { data: sessions, isLoading: sessionsLoading } =
    useSessionsByPackage(packageId ?? "");
  const { data: pricingRows = [] } = useQuery<{ key: string; amount_aed: number }[]>({
    queryKey: ["pricing", "daycare_checkin"],
    queryFn: async () => {
      const [single, hourly] = await Promise.all([
        supabase.rpc("resolve_woof_service_rate", { p_service_code: "daycare_full_day" }),
        supabase.rpc("resolve_woof_service_rate", { p_service_code: "daycare_hourly" }),
      ]);
      if (single.error) throw single.error;
      if (hourly.error) throw hourly.error;
      const singleAmount = (single.data as { amount_aed: number }[] | null)?.[0]?.amount_aed ?? 0;
      const hourlyAmount = (hourly.data as { amount_aed: number }[] | null)?.[0]?.amount_aed ?? 0;
      return [
        { key: "daycare_single_day", amount_aed: singleAmount },
        { key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: hourlyAmount },
      ];
    },
  });
  const { data: transportPricingRows = [] } = useQuery<{ key: string; amount_aed: number }[]>({
    queryKey: ["pricing", "transport_zones", "daycare"],
    queryFn: async () => {
      return (TRANSPORT_PRICING_KEYS as readonly string[]).map((key) => ({
        key,
        amount_aed: 0,
      }));
    },
  });

  const selectedPkg = packages?.find((p) => p.id === packageId) ?? null;
  const selectedPet = pets?.find((p) => p.id === selectedPkg?.pet_id) ?? null;

  const pickupsUsed = sessions?.filter((s) => s.pickup_used).length ?? 0;
  const dropoffsUsed = sessions?.filter((s) => s.dropoff_used).length ?? 0;
  const daycarePriceMap = useMemo(() => buildPriceMap(pricingRows), [pricingRows]);
  const singleDayPetIds = useMemo(
    () => selectedPetIds.filter((id) => (billingChoiceByPet[id] ?? "single") === "single"),
    [selectedPetIds, billingChoiceByPet],
  );
  const hourlyPetIds = useMemo(
    () => selectedPetIds.filter((id) => (billingChoiceByPet[id] ?? "single") === "hourly"),
    [selectedPetIds, billingChoiceByPet],
  );
  const singleDayCount = singleDayPetIds.length;
  const hourlyCount = hourlyPetIds.length;
  /** Pets actually checked in on single-day or hourly (drives transport capacity). */
  const physicalInvoicePetCount = singleDayCount + hourlyCount;

  const effectiveHourlyDogs = useMemo(() => {
    if (hourlyCount === 0) return 0;
    const trimmed = hourlyDogsInput.trim();
    if (trimmed === "") return 1;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isNaN(n) || n < 1) return 1;
    return Math.min(n, 99);
  }, [hourlyCount, hourlyDogsInput]);

  const effectiveHours = useMemo(() => {
    if (hourlyCount === 0) return 0;
    const trimmed = hourlyHoursInput.trim();
    if (trimmed === "") return 1;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isNaN(n) || n < 1) return 1;
    return Math.min(n, 48);
  }, [hourlyCount, hourlyHoursInput]);

  const singleDayRatePreview = useMemo(
    () => daycareGroupPricing(singleDayCount, daycarePriceMap),
    [singleDayCount, daycarePriceMap],
  );
  const hourlyLinearPreview = useMemo(
    () =>
      hourlyCount > 0
        ? daycareHourlyLinearTotal(effectiveHourlyDogs, effectiveHours, daycarePriceMap)
        : { pricingKey: "", unitRate: 0, total: 0, label: "" },
    [hourlyCount, effectiveHourlyDogs, effectiveHours, daycarePriceMap],
  );
  const transportRate = useMemo(() => {
    const key = transportPricingKey(checkInDraft.transport_zone);
    return transportPricingRows.find((r) => r.key === key)?.amount_aed ?? 0;
  }, [transportPricingRows, checkInDraft.transport_zone]);
  const transportTrips = [checkInDraft.pickup_used, checkInDraft.dropoff_used].filter(Boolean).length;
  const previewTransportQty = physicalInvoicePetCount
    ? transportQuantityForPets(checkInDraft.transport_zone, physicalInvoicePetCount)
    : 0;
  const previewTransportTotal = transportRate * previewTransportQty * transportTrips;
  const hourlyDurationTotal = hourlyCount > 0 ? hourlyLinearPreview.total : 0;
  const immediateInvoiceSubtotalPreview =
    singleDayRatePreview.total + hourlyDurationTotal + previewTransportTotal;
  const { data: discountPreview, isLoading: discountPreviewLoading } = useQuery<{
    discount_pct: number;
    discount_aed: number;
    final_aed: number;
  }>({
    queryKey: [
      "daycare",
      "checkin-preview-discount",
      ownerId,
      immediateInvoiceSubtotalPreview,
      skipInvoiceDiscount,
    ],
    enabled:
      !!ownerId &&
      physicalInvoicePetCount > 0 &&
      immediateInvoiceSubtotalPreview > 0 &&
      !skipInvoiceDiscount,
    queryFn: async () => {
      return {
        discount_pct: 0,
        discount_aed: 0,
        final_aed: immediateInvoiceSubtotalPreview,
      };
    },
  });

  const daycareInvoiceNetExVatPreview = useMemo(() => {
    if (physicalInvoicePetCount === 0 || immediateInvoiceSubtotalPreview <= 0) return null;
    if (skipInvoiceDiscount) return immediateInvoiceSubtotalPreview;
    if (discountPreviewLoading) return immediateInvoiceSubtotalPreview;
    return discountPreview?.final_aed ?? immediateInvoiceSubtotalPreview;
  }, [
    physicalInvoicePetCount,
    immediateInvoiceSubtotalPreview,
    skipInvoiceDiscount,
    discountPreviewLoading,
    discountPreview?.final_aed,
  ]);

  useEffect(() => {
    if (!packageId || !packages?.length) return;
    if (!packages.some((p) => p.id === packageId)) {
      setPackageId(null);
      syncPlannerSearchParams(setSearchParams, ownerId, null);
    }
  }, [packages, packageId, ownerId, setSearchParams]);

  const getUsablePackagesForPet = useCallback((petId: string) => {
    return (packages ?? []).filter((pkg) => {
      if (pkg.pet_id !== petId) return false;
      if ((pkg.days_used ?? 0) >= (pkg.total_days ?? 0)) return false;
      if (pkg.expiry_date && pkg.expiry_date < TODAY) return false;
      return true;
    });
  }, [packages]);

  useEffect(() => {
    setBillingChoiceByPet((prev) => {
      const next: Record<string, string> = {};
      for (const petId of selectedPetIds) {
        const usable = getUsablePackagesForPet(petId);
        const prevChoice = prev[petId];
        if (
          prevChoice === "single" ||
          prevChoice === "hourly" ||
          usable.some((pkg) => pkg.id === prevChoice)
        ) {
          next[petId] = prevChoice;
        } else if (usable.length > 0) {
          next[petId] = usable[0].id;
        } else {
          next[petId] = "single";
        }
      }
      return next;
    });
  }, [selectedPetIds, getUsablePackagesForPet]);

  useEffect(() => {
    if (hourlyCount === 0) {
      setHourlyDogsInput("");
      setHourlyDogsTouched(false);
      setHourlyHoursInput("");
      setHourlyHoursTouched(false);
      return;
    }
    if (!hourlyDogsTouched) {
      setHourlyDogsInput("1");
    }
    if (!hourlyHoursTouched) {
      setHourlyHoursInput("1");
    }
  }, [hourlyCount, hourlyDogsTouched, hourlyHoursTouched]);

  const handleOwnerSelect = (id: string, _label: string) => {
    setOwnerId(id);
    setPackageId(null);
    setSelectedPetIds([]);
    setBillingChoiceByPet({});
    setHourlyDogsInput("");
    setHourlyDogsTouched(false);
    setHourlyHoursInput("");
    setHourlyHoursTouched(false);
    syncPlannerSearchParams(setSearchParams, id, null);
  };

  const handleOwnerClear = () => {
    setOwnerId(null);
    setPackageId(null);
    setSelectedPetIds([]);
    setBillingChoiceByPet({});
    setHourlyDogsInput("");
    setHourlyDogsTouched(false);
    setHourlyHoursInput("");
    setHourlyHoursTouched(false);
    syncPlannerSearchParams(setSearchParams, null, null);
  };

  function pkgLabel(pkg: DaycarePackage) {
    const pet = pets?.find((p) => p.id === pkg.pet_id);
    return `${pet?.name ?? "Unknown"} — ${pkg.days_used}/${pkg.total_days}`;
  }

  const togglePetSelection = (petId: string, checked: boolean) => {
    setSelectedPetIds((prev) => {
      if (checked) {
        if (prev.includes(petId)) return prev;
        return [...prev, petId];
      }
      return prev.filter((id) => id !== petId);
    });
  };

  const handleCheckInSelected = async () => {
    if (!ownerId) {
      toast.error("Select a client first");
      return;
    }
    if (selectedPetIds.length === 0) {
      toast.error("Select at least one dog");
      return;
    }

    if (
      (checkInDraft.pickup_used || checkInDraft.dropoff_used) &&
      privateDubaiOverCapacity(checkInDraft.transport_zone, selectedPetIds.length)
    ) {
      toast.error(
        "Private Dubai transport is capped at 3 dogs. Split the group or choose Dubai — Shared.",
      );
      return;
    }

    setIsSubmittingCheckIn(true);
    const failures: string[] = [];
    let successCount = 0;
    const sessionsCreated: Record<string, string> = {};
    const consumedCreditByPet: Record<string, DaycarePackage> = {};
    const privateFlat = checkInDraft.transport_zone === "dubai_private";

    for (const petId of selectedPetIds) {
      const pet = pets?.find((p) => p.id === petId);
      const petName = pet?.name ?? "Pet";
      const choice = billingChoiceByPet[petId] ?? "single";
      const chosenPackageId = choice === "single" || choice === "hourly" ? null : choice;
      const chosenCredit = chosenPackageId ? packages?.find((pkg) => pkg.id === chosenPackageId) : null;

      try {
        const session = await addDay.mutateAsync({
          session_date: checkInDraft.session_date,
          pet_id: petId,
          owner_id: ownerId,
          package_id: chosenPackageId,
          pickup_used: checkInDraft.pickup_used,
          dropoff_used: checkInDraft.dropoff_used,
          logged_by: checkInDraft.logged_by || null,
          remark: checkInDraft.remark || null,
          dog_size: checkInDraft.dog_size,
        });

        sessionsCreated[petId] = session.id;

        if (chosenCredit) {
          const consumeUnits = chosenCredit.service_code === "daycare_hourly" ? Math.max(1, effectiveHours) : 1;
          await consumeCredit.mutateAsync({
            creditId: chosenCredit.id,
            units: consumeUnits,
            consumedForRefId: session.id,
            consumedForRefType: "daycare_session",
          });
          consumedCreditByPet[petId] = chosenCredit;
        }

        successCount += 1;
      } catch (error) {
        const message = extractErrorMessage(error);
        failures.push(`${petName}: ${message}`);
      }
    }

    const okSingleIds = singleDayPetIds.filter((id) => sessionsCreated[id]);
    const okHourlyIds = hourlyPetIds.filter((id) => sessionsCreated[id]);
    const okCreditIds = selectedPetIds.filter(
      (id) => sessionsCreated[id] && !okSingleIds.includes(id) && !okHourlyIds.includes(id),
    );
    const invoicedPetTotal = okSingleIds.length + okHourlyIds.length + okCreditIds.length;
    const hourlyDogsForInvoice = okHourlyIds.length > 0 ? effectiveHourlyDogs : 0;
    const hourlyHoursForInvoice = okHourlyIds.length > 0 ? effectiveHours : 0;

    if (invoicedPetTotal > 0) {
      const singleRate = daycareGroupPricing(okSingleIds.length, daycarePriceMap);
      const hourlyLinear =
        hourlyDogsForInvoice > 0 && hourlyHoursForInvoice > 0
          ? daycareHourlyLinearTotal(hourlyDogsForInvoice, hourlyHoursForInvoice, daycarePriceMap)
          : { pricingKey: "", unitRate: 0, total: 0, label: "" };
      const zoneLabel = transportZoneLabel(checkInDraft.transport_zone);
      const transportKey = transportPricingKey(checkInDraft.transport_zone);
      const lineItems: {
        description: string;
        quantity: number;
        unitPrice: number;
        pricingKey?: string;
        serviceType?: string;
        preserveUnitPrice?: boolean;
      }[] = [];

      if (okSingleIds.length > 0 && singleRate.pricingKey) {
        lineItems.push({
          description: `${singleRate.label} (${okSingleIds.length} dog${okSingleIds.length === 1 ? "" : "s"})`,
          quantity: okSingleIds.length,
          unitPrice: singleRate.total / okSingleIds.length,
          pricingKey: singleRate.pricingKey,
          serviceType: "daycare",
          preserveUnitPrice: true,
        });
      }
      if (
        okHourlyIds.length > 0 &&
        hourlyDogsForInvoice > 0 &&
        hourlyHoursForInvoice > 0 &&
        hourlyLinear.total > 0
      ) {
        lineItems.push({
          description: hourlyLinear.label,
          quantity: hourlyDogsForInvoice * hourlyHoursForInvoice,
          unitPrice: hourlyLinear.unitRate,
          pricingKey: hourlyLinear.pricingKey,
          serviceType: "daycare",
          preserveUnitPrice: true,
        });
      }
      if (okCreditIds.length > 0) {
        for (const petId of okCreditIds) {
          const petName = pets?.find((p) => p.id === petId)?.name ?? "Pet";
          const credit = consumedCreditByPet[petId];
          const packageName = credit?.package_name ?? "package credit";
          const isHourlyCredit = credit?.service_code === "daycare_hourly";
          const units = isHourlyCredit ? Math.max(1, effectiveHours) : 1;
          lineItems.push({
            description: `${isHourlyCredit ? "Daycare hourly" : "Daycare full day"} — ${petName} (covered by ${packageName})`,
            quantity: units,
            unitPrice: 0,
            serviceType: "daycare",
            preserveUnitPrice: true,
          });
        }
      }

      const includePickup = checkInDraft.pickup_used;
      const includeDropoff = checkInDraft.dropoff_used;
      const billTransport = checkInDraft.transport_zone !== "complimentary";
      const transportQty = billTransport
        ? transportQuantityForPets(checkInDraft.transport_zone, invoicedPetTotal)
        : 0;

      if (billTransport && includePickup) {
        lineItems.push({
          description: privateFlat
            ? `Pickup transport (${zoneLabel}) — family flat rate`
            : `Pickup transport (${zoneLabel})`,
          quantity: transportQty,
          unitPrice: transportRate,
          pricingKey: transportKey,
          serviceType: "transport",
        });
      }
      if (billTransport && includeDropoff) {
        lineItems.push({
          description: privateFlat
            ? `Drop-off transport (${zoneLabel}) — family flat rate`
            : `Drop-off transport (${zoneLabel})`,
          quantity: transportQty,
          unitPrice: transportRate,
          pricingKey: transportKey,
          serviceType: "transport",
        });
      }

      const referencePetId =
        selectedPetIds.find((id) => sessionsCreated[id] && (okSingleIds.includes(id) || okHourlyIds.includes(id))) ??
        selectedPetIds.find((id) => sessionsCreated[id]);
      const referenceSessionId = referencePetId ? sessionsCreated[referencePetId] : null;

      if (referenceSessionId && lineItems.length > 0) {
        try {
          await createServiceInvoice({
            ownerId,
            serviceType: "daycare",
            referenceId: referenceSessionId,
            lineItems,
            notes: checkInDraft.remark || null,
            invoiceStatus: "finalised",
            skipMemberDiscount: skipInvoiceDiscount,
          });
        } catch (error) {
          const message = extractErrorMessage(error);
          toast.error(`Invoice failed: ${message}`);
        }
      }
    }

    setIsSubmittingCheckIn(false);

    if (successCount > 0) {
      toast.success(`Checked in ${successCount} dog${successCount !== 1 ? "s" : ""}`);
      setSelectedPetIds([]);
      setBillingChoiceByPet({});
      setHourlyDogsInput("");
      setHourlyDogsTouched(false);
      setHourlyHoursInput("");
      setHourlyHoursTouched(false);
      setSkipInvoiceDiscount(false);
      setCheckInDraft((prev) => ({
        ...prev,
        pickup_used: false,
        dropoff_used: false,
        logged_by: "",
        remark: "",
        dog_size: DEFAULT_DOG_SIZE,
      }));
    }

    if (failures.length > 0) {
      toast.error(`Some check-ins failed: ${failures.join(" | ")}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search-first check-in */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daycare Check-in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search owner or dog</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[12rem] flex-1">
                <OwnerCombobox
                  selectedId={
                    ownerId && (resolvedOwnerLabel || ownerDetailLoading)
                      ? ownerId
                      : null
                  }
                  selectedLabel={
                    ownerDetailLoading
                      ? "Loading…"
                      : resolvedOwnerLabel
                  }
                  onSelect={handleOwnerSelect}
                  onClear={handleOwnerClear}
                  placeholder="Search by client name, pet name, or phone…"
                />
              </div>
              {ownerFromUrl &&
              ownerFromUrl.id === ownerId &&
              null}
            </div>
          </div>

          {!!ownerId && (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Select dog(s)</Label>
                {!pets?.length ? (
                  <p className="text-sm text-muted-foreground">No pets found for this client.</p>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {pets.map((pet) => {
                      const checked = selectedPetIds.includes(pet.id);
                      const usablePackages = getUsablePackagesForPet(pet.id);
                      return (
                        <div key={pet.id} className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`checkin_pet_${pet.id}`}
                                checked={checked}
                                onCheckedChange={(v) => togglePetSelection(pet.id, v === true)}
                              />
                              <Label htmlFor={`checkin_pet_${pet.id}`} className="font-medium">
                                {pet.name}
                              </Label>
                            </div>
                            <Badge variant="outline" className={usablePackages.length > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}>
                              {usablePackages.length > 0 ? `${usablePackages.length} active package${usablePackages.length !== 1 ? "s" : ""}` : "No active package"}
                            </Badge>
                          </div>

                          {checked && (
                            <div className="pl-6 max-w-md space-y-1">
                              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Billing path</Label>
                              <Select
                                value={billingChoiceByPet[pet.id] ?? (usablePackages[0]?.id ?? "single")}
                                onValueChange={(value) => {
                                  setBillingChoiceByPet((prev) => ({ ...prev, [pet.id]: value }));
                                }}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="single">Single day (invoice now)</SelectItem>
                                  <SelectItem value="hourly">Hourly (invoice now)</SelectItem>
                                  {usablePackages.map((pkg) => (
                                    <SelectItem key={pkg.id} value={pkg.id}>
                                      Use credit ({pkg.total_days - pkg.days_used} remaining{pkg.service_code === "daycare_hourly" ? " hourly" : ""}{pkg.is_bonus ? ", bonus choice" : ""})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {usablePackages.some((pkg) => pkg.is_bonus && pkg.service_code === "daycare_full_day") && (
                                <p className="text-[11px] text-amber-700">
                                  Using bonus daycare credit revokes the sibling bonus Splash credit from the same package.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {hourlyCount > 0 && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-4 max-w-xl">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Hourly daycare</p>
                    <p className="text-xs text-muted-foreground">
                      Hourly rate comes from the Live Rate Card (per dog per hour). Total = rate × dogs × hours. Transport follows pets checked in above ({hourlyCount} on hourly).
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="hourly_dog_count">Number of dogs</Label>
                      <Input
                        id="hourly_dog_count"
                        type="number"
                        min={1}
                        max={99}
                        step={1}
                        placeholder="1"
                        inputMode="numeric"
                        className="h-9 max-w-[8rem]"
                        value={hourlyDogsInput}
                        onChange={(e) => {
                          setHourlyDogsInput(e.target.value);
                          setHourlyDogsTouched(true);
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hourly_hours_count">Number of hours</Label>
                      <Input
                        id="hourly_hours_count"
                        type="number"
                        min={1}
                        max={48}
                        step={1}
                        placeholder="1"
                        inputMode="numeric"
                        className="h-9 max-w-[8rem]"
                        value={hourlyHoursInput}
                        onChange={(e) => {
                          setHourlyHoursInput(e.target.value);
                          setHourlyHoursTouched(true);
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/25 bg-background/90 p-4 space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Hourly total (check before confirming)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      AED {hourlyLinearPreview.unitRate.toFixed(2)} × {effectiveHourlyDogs} dog
                      {effectiveHourlyDogs === 1 ? "" : "s"} × {effectiveHours} hr
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      AED {hourlyDurationTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              <DogSizeField
                name="daycare-checkin-dog-size"
                value={checkInDraft.dog_size}
                onChange={(v) => setCheckInDraft((prev) => ({ ...prev, dog_size: v }))}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="checkin_session_date">Date</Label>
                  <Input
                    id="checkin_session_date"
                    type="date"
                    value={checkInDraft.session_date}
                    onChange={(e) => setCheckInDraft((prev) => ({ ...prev, session_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkin_logged_by">Logged by</Label>
                  <Select
                    value={checkInDraft.logged_by || undefined}
                    onValueChange={(v) => setCheckInDraft((prev) => ({ ...prev, logged_by: v }))}
                  >
                    <SelectTrigger id="checkin_logged_by">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOGGED_BY_OPTIONS.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Transport options</Label>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="checkin_pickup"
                      checked={checkInDraft.pickup_used}
                      onCheckedChange={(v) => setCheckInDraft((prev) => ({ ...prev, pickup_used: v === true }))}
                    />
                    <Label htmlFor="checkin_pickup" className="text-sm">Pickup</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="checkin_dropoff"
                      checked={checkInDraft.dropoff_used}
                      onCheckedChange={(v) => setCheckInDraft((prev) => ({ ...prev, dropoff_used: v === true }))}
                    />
                    <Label htmlFor="checkin_dropoff" className="text-sm">Drop-off</Label>
                  </div>
                </div>
                {(checkInDraft.pickup_used || checkInDraft.dropoff_used) && (
                  <div className="max-w-xs space-y-1.5">
                    <Label>Transport option</Label>
                    <Select
                      value={checkInDraft.transport_zone}
                      onValueChange={(value) => setCheckInDraft((prev) => ({
                        ...prev,
                        transport_zone: value as TransportZone,
                      }))}
                    >
                      <SelectTrigger>
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
                    {(() => {
                      const zone = checkInDraft.transport_zone;
                      const pets = Math.max(1, physicalInvoicePetCount || selectedPetIds.length);
                      const opt = TRANSPORT_ZONE_OPTIONS.find((o) => o.value === zone);
                      const over = privateDubaiOverCapacity(zone, pets);
                      const trips = transportTrips;
                      const qty = transportQuantityForPets(zone, pets);
                      const total = transportRate * qty * Math.max(1, trips);
                      if (zone === "complimentary") {
                        return (
                          <p className="text-xs text-muted-foreground">
                            Complimentary transport — no charge and no transport lines on the invoice.
                          </p>
                        );
                      }
                      return (
                        <>
                          <p className="text-xs text-muted-foreground">
                            AED {transportRate.toFixed(2)} × {qty}
                            {zone === "dubai_private" ? " (flat per trip)" : " per dog"}
                            {opt ? ` — ${opt.helper}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Estimated total: AED {total.toFixed(2)} ({trips || 1} trip{trips === 1 ? "" : "s"})
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

              {selectedPetIds.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Auto pricing preview
                  </p>
                  {physicalInvoicePetCount === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No immediate invoice — all selected pets are using package credits.
                    </p>
                  ) : (
                    <>
                      {singleDayCount > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {singleDayRatePreview.label} ({singleDayCount} dog
                            {singleDayCount === 1 ? "" : "s"})
                          </span>
                          <span>AED {singleDayRatePreview.total.toFixed(2)}</span>
                        </div>
                      )}
                      {hourlyCount > 0 && (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-sm">
                            <span>Hourly daycare (rate × dogs × hours)</span>
                            <span className="tabular-nums">AED {hourlyDurationTotal.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            AED {hourlyLinearPreview.unitRate.toFixed(2)} × {effectiveHourlyDogs} ×{" "}
                            {effectiveHours}
                          </p>
                        </div>
                      )}
                      {(checkInDraft.pickup_used || checkInDraft.dropoff_used) && (
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            Transport ({transportTrips} trip{transportTrips === 1 ? "" : "s"})
                            {checkInDraft.transport_zone === "complimentary" ? " — complimentary" : ""}
                          </span>
                          <span>
                            {checkInDraft.transport_zone === "complimentary"
                              ? "No charge"
                              : `AED ${previewTransportTotal.toFixed(2)}`}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span>Subtotal</span>
                        <span>AED {immediateInvoiceSubtotalPreview.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col gap-2 rounded-md border bg-background/80 p-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="daycare_skip_discount"
                            checked={skipInvoiceDiscount}
                            onCheckedChange={setSkipInvoiceDiscount}
                          />
                          <Label htmlFor="daycare_skip_discount" className="text-sm font-normal cursor-pointer">
                            Bill without member discount
                          </Label>
                        </div>
                        {skipInvoiceDiscount && (
                          <span className="text-xs text-muted-foreground sm:text-right">
                            Profile discount will not be applied to this invoice.
                          </span>
                        )}
                      </div>
                      {!skipInvoiceDiscount && (
                        <div className="flex items-center justify-between text-sm text-emerald-700">
                          <span>
                            Auto discount
                            {discountPreview?.discount_pct
                              ? ` (${discountPreview.discount_pct.toFixed(2)}%)`
                              : ""}
                          </span>
                          <span>
                            - AED {(discountPreview?.discount_aed ?? 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span>Net (ex VAT)</span>
                        <span className="tabular-nums">
                          {daycareInvoiceNetExVatPreview != null
                            ? `AED ${daycareInvoiceNetExVatPreview.toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                      {daycareInvoiceNetExVatPreview != null ? (
                        <div className="flex items-center justify-between text-sm">
                          <span>{vatLineLabel()}</span>
                          <span className="tabular-nums">
                            AED {vatAmountFromNet(daycareInvoiceNetExVatPreview).toFixed(2)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between font-semibold">
                        <span>Total incl. VAT</span>
                        <span className="tabular-nums">
                          {daycareInvoiceNetExVatPreview != null
                            ? `AED ${grandTotalFromNet(daycareInvoiceNetExVatPreview).toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="checkin_remark">Remark</Label>
                <Textarea
                  id="checkin_remark"
                  rows={2}
                  value={checkInDraft.remark}
                  onChange={(e) => setCheckInDraft((prev) => ({ ...prev, remark: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Single-day and hourly billing paths create a finalized invoice immediately using the Live Rate Card daycare keys (combined per check-in batch).
                </p>
              </div>

              <Button
                onClick={handleCheckInSelected}
                disabled={isSubmittingCheckIn || selectedPetIds.length === 0}
              >
                {isSubmittingCheckIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Check in {selectedPetIds.length > 0 ? `${selectedPetIds.length} pet${selectedPetIds.length !== 1 ? "s" : ""}` : "selected pets"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Planner package selector */}
      <div className="max-w-xl space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Package planner view</Label>
        <Select
          value={packageId ?? ""}
          onValueChange={(pid) => {
            setPackageId(pid);
            syncPlannerSearchParams(setSearchParams, ownerId, pid);
          }}
          disabled={!ownerId || !packages?.length}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={!ownerId ? "Select client from check-in above" : packages?.length ? "Select package" : "No packages"} />
          </SelectTrigger>
          <SelectContent>
            {packages?.map(pkg => (
              <SelectItem key={pkg.id} value={pkg.id}>
                {pkgLabel(pkg)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {!packageId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Select a client and package to view the day care planner</p>
        </div>
      )}

      {/* Content */}
      {packageId && selectedPkg && (
        <>
          {/* Summary card + print */}
          <div className="flex items-start justify-between gap-4">
            <Card className="flex-1">
              <CardContent className="pt-5 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                  {[
                    { label: "Client",        value: resolvedOwnerLabel },
                    { label: "Dog",           value: selectedPet?.name },
                    { label: "Day Care Days", value: `${selectedPkg.days_used} / ${selectedPkg.total_days}` },
                    { label: "Pickups Used",  value: String(pickupsUsed) },
                    { label: "Drop-offs Used",value: String(dropoffsUsed) },
                  ].map(({ label, value }) => (
                    <div key={label} className="space-y-0.5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
                      <p className="text-sm font-semibold">{value ?? "—"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button variant="outline" size="sm" onClick={() => window.print()} className="shrink-0">
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
          </div>

          {/* Sessions table */}
          <SessionsTable
            sessions={sessions ?? []}
            packageId={packageId}
            petId={selectedPkg.pet_id}
            ownerId={selectedPkg.owner_id}
            isLoading={sessionsLoading}
          />
        </>
      )}
    </div>
  );
}

// ── Daycare operations ─────────────────────────────────────────────────────────

type DaycareListPreset = "today" | "tomorrow" | "next7";
type CollectionStatus = "not_collected" | "owner" | "pet_taxi";

const COLLECTION_META_PREFIX = "COLLECTION_BY:";

function parseCollectionStatus(
  notes: string | null | undefined,
  checkedOutAt: string | null | undefined,
): { status: CollectionStatus; visibleNotes: string } {
  const raw = (notes ?? "").trim();
  if (!raw) {
    return {
      status: checkedOutAt ? "owner" : "not_collected",
      visibleNotes: "",
    };
  }
  const lines = raw.split("\n").map((line) => line.trim());
  const marker = lines.find((line) => line.startsWith(COLLECTION_META_PREFIX));
  const cleaned = lines.filter((line) => !line.startsWith(COLLECTION_META_PREFIX)).join("\n").trim();
  if (!marker) {
    return {
      status: checkedOutAt ? "owner" : "not_collected",
      visibleNotes: cleaned,
    };
  }
  const value = marker.replace(COLLECTION_META_PREFIX, "").trim();
  if (value === "pet_taxi") return { status: "pet_taxi", visibleNotes: cleaned };
  if (value === "owner") return { status: "owner", visibleNotes: cleaned };
  return {
    status: checkedOutAt ? "owner" : "not_collected",
    visibleNotes: cleaned,
  };
}

function composeNotesWithCollection(notes: string | null | undefined, status: CollectionStatus): string | null {
  const raw = (notes ?? "").trim();
  const cleaned = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith(COLLECTION_META_PREFIX))
    .join("\n")
    .trim();
  if (status === "not_collected") return cleaned || null;
  const meta = `${COLLECTION_META_PREFIX}${status}`;
  return cleaned ? `${cleaned}\n${meta}` : meta;
}

function DaycareOperationsTab() {
  const [datePreset, setDatePreset] = useState<DaycareListPreset>("today");
  const [anchorDate, setAnchorDate] = useState(TODAY);
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const rangeStart = useMemo(
    () => (datePreset === "tomorrow" ? format(addDays(parseISO(anchorDate), 1), "yyyy-MM-dd") : anchorDate),
    [datePreset, anchorDate],
  );
  const rangeEnd = useMemo(
    () => (datePreset === "next7" ? format(addDays(parseISO(rangeStart), 6), "yyyy-MM-dd") : rangeStart),
    [datePreset, rangeStart],
  );

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["daycare_sessions", "operations", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("id, session_date, checked_in, checked_in_at, checked_out_at, notes, package_id, pickup_used, dropoff_used, pets(name), owners(first_name, last_name)")
        .gte("session_date", rangeStart)
        .lte("session_date", rangeEnd)
        .order("session_date", { ascending: true })
        .order("checked_in_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalDogs = sessions.length;
  const collectedDogs = sessions.filter((s) => Boolean(s.checked_out_at)).length;
  const remainingDogs = totalDogs - collectedDogs;

  const updateCollectionStatus = async (
    session: {
      id: string;
      notes: string | null;
      checked_out_at: string | null;
    },
    status: CollectionStatus,
  ) => {
    const updates = {
      checked_out_at: status === "not_collected" ? null : new Date().toISOString(),
      notes: composeNotesWithCollection(session.notes, status),
    };
    setUpdatingSessionId(session.id);
    const { error } = await supabase
      .from("daycare_sessions")
      .update(updates)
      .eq("id", session.id);
    setUpdatingSessionId(null);
    if (error) {
      toast.error(error.message || "Could not update collection status");
      return;
    }
    toast.success(
      status === "not_collected"
        ? "Marked as not collected"
        : `Marked as collected by ${status === "pet_taxi" ? "pet taxi" : "owner"}`,
    );
    queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Operations Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant={datePreset === "today" ? "default" : "outline"} onClick={() => setDatePreset("today")}>Today</Button>
          <Button size="sm" variant={datePreset === "tomorrow" ? "default" : "outline"} onClick={() => setDatePreset("tomorrow")}>Tomorrow</Button>
          <Button size="sm" variant={datePreset === "next7" ? "default" : "outline"} onClick={() => setDatePreset("next7")}>Next 7 days</Button>
          <Input
            type="date"
            value={anchorDate}
            onChange={(e) => {
              setAnchorDate(e.target.value);
              setDatePreset("today");
            }}
            className="w-44"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daycare Operations List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">Total: {totalDogs}</Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              Collected: {collectedDogs}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              Remaining: {remainingDogs}
            </Badge>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : sessions.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground text-center">No daycare sessions found for this range.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const owner = ownerDisplayName(s.owners?.first_name, s.owners?.last_name);
                const collection = parseCollectionStatus(s.notes, s.checked_out_at);
                const tags = buildDaycareTags({
                  sessionDate: s.session_date,
                  todayDate: TODAY,
                  checkedIn: Boolean(s.checked_in),
                  packageId: s.package_id,
                });
                return (
                  <div key={s.id} className="rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{s.pets?.name ?? "—"} - {owner}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(s.session_date), "d MMM yyyy")} ·{" "}
                        {collection.visibleNotes || "No notes"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <Badge key={`${s.id}-${tag.key}`} variant="outline" className={tagToneClass(tag.tone)}>
                            {tag.label}
                          </Badge>
                        ))}
                        {s.pickup_used && <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">Pickup</Badge>}
                        {s.dropoff_used && <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">Drop-off</Badge>}
                        {collection.status === "not_collected" ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            Not collected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Collected by {collection.status === "pet_taxi" ? "Pet Taxi" : "Owner"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="min-w-[170px] space-y-1">
                      <p className="text-right text-xs text-muted-foreground">
                        In: {s.checked_in_at ? format(parseISO(s.checked_in_at), "HH:mm") : "—"}
                      </p>
                      <Select
                        value={collection.status}
                        disabled={updatingSessionId === s.id}
                        onValueChange={(value) => {
                          void updateCollectionStatus(
                            {
                              id: s.id,
                              notes: s.notes,
                              checked_out_at: s.checked_out_at,
                            },
                            value as CollectionStatus,
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_collected">Not collected</SelectItem>
                          <SelectItem value="owner">Collected by owner</SelectItem>
                          <SelectItem value="pet_taxi">Collected by pet taxi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DaycarePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "operations" ? requestedTab : "planner";

  const setTab = (value: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", value);
        return n;
      },
      { replace: true }
    );
  };

  return (
    <>
      <TopBar title="Daycare" />
      <main className="flex-1 overflow-auto p-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="planner">Planner</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
          </TabsList>

          <TabsContent value="planner" className="mt-0">
            <PlannerTab />
          </TabsContent>

          <TabsContent value="operations" className="mt-0">
            <DaycareOperationsTab />
          </TabsContent>

        </Tabs>
      </main>
    </>
  );
};

export default DaycarePage;
