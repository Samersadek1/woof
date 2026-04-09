import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { useOwners, useOwner } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import {
  useDaycarePackages,
  useSessionsByPackage,
  useAllDaycarePackages,
  useCreateDaycarePackage,
  useAddDaycareDay,
  useUpdateDaycareSession,
  useDeleteDaycareSession,
  type DaycarePackage,
  type PackageWithDetails,
  type SessionRow,
} from "@/hooks/useDaycare";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  Search,
  Printer,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberType = Database["public"]["Enums"]["member_type"];

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY = format(new Date(), "yyyy-MM-dd");

const MEMBER_BADGE: Record<string, string> = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  silver:   "bg-blue-50  text-blue-700  border-blue-200",
  gold:     "bg-amber-50 text-amber-700 border-amber-200",
};

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

function OwnerCombobox({
  selectedId, selectedLabel, onSelect, onClear, placeholder = "Search owner by name or phone…",
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
            <p className="p-3 text-sm text-muted-foreground">No owners found</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto divide-y">
              {owners.map(o => {
                const label = `${o.first_name} ${o.last_name}`;
                const petCount = o.pets?.length ?? 0;
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
                        {petCount} dog{petCount !== 1 ? "s" : ""} · {o.phone}
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
  const deleteSession = useDeleteDaycareSession();
  const addDay        = useAddDaycareDay();

  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editDraft,  setEditDraft]  = useState({ pickup_used: false, dropoff_used: false, logged_by: "", remark: "" });
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [addDraft,   setAddDraft]   = useState({ session_date: TODAY, pickup_used: false, dropoff_used: false, logged_by: "", remark: "" });

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
              <TableHead className="min-w-[90px]">Date</TableHead>
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

                  {/* Date */}
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(parseISO(s.session_date), "d MMM")}
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

  useEffect(() => {
    setOwnerId(ownerIdParam);
    setPackageId(packageIdParam);
  }, [ownerIdParam, packageIdParam]);

  const { data: ownerFromUrl, isLoading: ownerDetailLoading } = useOwner(
    ownerId ?? ""
  );

  const resolvedOwnerLabel =
    ownerFromUrl?.id === ownerId
      ? `${ownerFromUrl.first_name} ${ownerFromUrl.last_name}`
      : null;

  const { data: pets } = usePets(ownerId ?? "");
  const { data: packages } = useDaycarePackages(ownerId ?? "");
  const { data: sessions, isLoading: sessionsLoading } =
    useSessionsByPackage(packageId ?? "");

  const selectedPkg = packages?.find((p) => p.id === packageId) ?? null;
  const selectedPet = pets?.find((p) => p.id === selectedPkg?.pet_id) ?? null;

  const pickupsUsed = sessions?.filter((s) => s.pickup_used).length ?? 0;
  const dropoffsUsed = sessions?.filter((s) => s.dropoff_used).length ?? 0;

  useEffect(() => {
    if (!packageId || !packages?.length) return;
    if (!packages.some((p) => p.id === packageId)) {
      setPackageId(null);
      syncPlannerSearchParams(setSearchParams, ownerId, null);
    }
  }, [packages, packageId, ownerId, setSearchParams]);

  const handleOwnerSelect = (id: string, _label: string) => {
    setOwnerId(id);
    setPackageId(null);
    syncPlannerSearchParams(setSearchParams, id, null);
  };

  const handleOwnerClear = () => {
    setOwnerId(null);
    setPackageId(null);
    syncPlannerSearchParams(setSearchParams, null, null);
  };

  function pkgLabel(pkg: DaycarePackage) {
    const pet = pets?.find((p) => p.id === pkg.pet_id);
    return `${pet?.name ?? "Unknown"} — ${pkg.days_used}/${pkg.total_days}`;
  }

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
        <div className="flex-1 space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Client / Dog</Label>
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
          />
        </div>

        <div className="flex-1 space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Package</Label>
          <Select
            value={packageId ?? ""}
            onValueChange={(pid) => {
              setPackageId(pid);
              syncPlannerSearchParams(setSearchParams, ownerId, pid);
            }}
            disabled={!ownerId || !packages?.length}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={!ownerId ? "Select client first" : packages?.length ? "Select package" : "No packages"} />
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

// ── Packages tab: PackageCard ─────────────────────────────────────────────────

function PackageCard({ pkg }: { pkg: PackageWithDetails }) {
  const [, setSearchParams] = useSearchParams();
  const remaining  = pkg.total_days - pkg.days_used;
  const pct        = Math.min(100, (pkg.days_used / Math.max(1, pkg.total_days)) * 100);
  const isExhausted = remaining <= 0;
  const memberType  = (pkg.owners?.member_type ?? "standard") as MemberType;

  const openInPlanner = () => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "planner");
        n.set("ownerId", pkg.owner_id);
        n.set("packageId", pkg.id);
        return n;
      },
      { replace: true }
    );
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      className={`cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isExhausted ? "opacity-60" : ""}`}
      onClick={openInPlanner}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openInPlanner();
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="font-semibold truncate">
              {pkg.pets?.name ?? "Unknown Pet"}
              <span className="font-normal text-muted-foreground"> — </span>
              {pkg.owners ? `${pkg.owners.first_name} ${pkg.owners.last_name}` : "Unknown Owner"}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={MEMBER_BADGE[memberType] ?? MEMBER_BADGE.standard}>
                {memberType.charAt(0).toUpperCase() + memberType.slice(1)}
              </Badge>
              {isExhausted ? (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                  Exhausted
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                  Active
                </Badge>
              )}
            </div>
          </div>

          {/* Credits counter */}
          <div className={`text-right shrink-0 ${creditColour(remaining)}`}>
            {remaining <= 3 && <AlertTriangle className="h-3.5 w-3.5 ml-auto mb-0.5" />}
            <p className="text-2xl font-bold tabular-nums leading-none">
              {pkg.days_used}<span className="text-base font-normal text-muted-foreground">/{pkg.total_days}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{remaining} remaining</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${creditBarColour(remaining)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pkg.expiry_date && (
            <p className="text-[10px] text-muted-foreground">
              Expires {format(parseISO(pkg.expiry_date), "d MMM yyyy")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Packages tab: NewPackageSheet ─────────────────────────────────────────────

function NewPackageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createPackage = useCreateDaycarePackage();

  const [ownerId,    setOwnerId]    = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [form, setForm] = useState({
    pet_id:        "",
    total_days:    12,
    purchase_date: TODAY,
    expiry_date:   "",
    price_paid:    "",
    notes:         "",
  });

  const { data: pets } = usePets(ownerId ?? "");

  const setField = (field: string, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const resetAndClose = () => {
    setOwnerId(null);
    setOwnerLabel(null);
    setForm({ pet_id: "", total_days: 12, purchase_date: TODAY, expiry_date: "", price_paid: "", notes: "" });
    onClose();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId || !form.pet_id) {
      toast.error("Select a client and pet");
      return;
    }
    createPackage.mutate({
      owner_id:      ownerId,
      pet_id:        form.pet_id,
      total_days:    form.total_days,
      purchase_date: form.purchase_date,
      expiry_date:   form.expiry_date   || null,
      price_paid:    form.price_paid    ? parseFloat(form.price_paid) : null,
      notes:         form.notes         || null,
      days_used:     0,
    }, {
      onSuccess: () => { toast.success("Package created"); resetAndClose(); },
      onError:   (err) => toast.error(err.message),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Daycare Package</SheetTitle>
          <SheetDescription>Add a prepaid day care package for a pet.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Client <span className="text-destructive">*</span></Label>
            <OwnerCombobox
              selectedId={ownerId}
              selectedLabel={ownerLabel}
              onSelect={(id, label) => { setOwnerId(id); setOwnerLabel(label); setField("pet_id", ""); }}
              onClear={() => { setOwnerId(null); setOwnerLabel(null); setField("pet_id", ""); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg_pet">Pet <span className="text-destructive">*</span></Label>
            <Select
              value={form.pet_id}
              onValueChange={(v) => setField("pet_id", v)}
              disabled={!ownerId || !pets?.length}
            >
              <SelectTrigger id="pkg_pet">
                <SelectValue placeholder={!ownerId ? "Select client first" : "Select pet"} />
              </SelectTrigger>
              <SelectContent>
                {pets?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pkg_days">Total days <span className="text-destructive">*</span></Label>
              <Input
                id="pkg_days"
                type="number"
                min="1"
                value={form.total_days}
                onChange={(e) => setField("total_days", parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg_price">Price paid (AED)</Label>
              <Input
                id="pkg_price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.price_paid}
                onChange={(e) => setField("price_paid", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pkg_purchase">Purchase date <span className="text-destructive">*</span></Label>
              <Input
                id="pkg_purchase"
                type="date"
                value={form.purchase_date}
                onChange={(e) => setField("purchase_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg_expiry">Expiry date</Label>
              <Input
                id="pkg_expiry"
                type="date"
                value={form.expiry_date}
                onChange={(e) => setField("expiry_date", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg_notes">Notes</Label>
            <Textarea
              id="pkg_notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>

          <Separator />

          <Button type="submit" className="w-full" disabled={createPackage.isPending}>
            {createPackage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Package
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── TAB 2: PackagesTab ────────────────────────────────────────────────────────

type PkgFilter = "all" | "low" | "exhausted";

function PackagesTab() {
  const [filter,   setFilter]   = useState<PkgFilter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: packages, isLoading } = useAllDaycarePackages();

  const filtered = (packages ?? []).filter(pkg => {
    const remaining = pkg.total_days - pkg.days_used;
    if (filter === "low")       return remaining > 0 && remaining <= 2;
    if (filter === "exhausted") return remaining <= 0;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Packages</h3>
          <Select value={filter} onValueChange={(v) => setFilter(v as PkgFilter)}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Packages</SelectItem>
              <SelectItem value="low">Low Credits (≤2 remaining)</SelectItem>
              <SelectItem value="exhausted">Exhausted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Package
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Package className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">
            {filter === "all" ? "No packages yet" : "No packages match this filter"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(pkg => <PackageCard key={pkg.id} pkg={pkg} />)}
        </div>
      )}

      <NewPackageSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DaycarePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab =
    searchParams.get("tab") === "packages" ? "packages" : "planner";

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
            <TabsTrigger value="packages">Packages</TabsTrigger>
          </TabsList>

          <TabsContent value="planner" className="mt-0">
            <PlannerTab />
          </TabsContent>

          <TabsContent value="packages" className="mt-0">
            <PackagesTab />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
};

export default DaycarePage;
