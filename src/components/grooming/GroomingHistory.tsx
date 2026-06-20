import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { labelForGroomingService } from "@/lib/groomingCatalog";
import {
  normalizeGroomingWorkflowStatus,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/groomingWorkflow";
import {
  useDeleteGroomingAppointment,
  useGroomingHistoryList,
  type GroomingAppointmentWithJoins,
} from "@/hooks/useGrooming";
import { useAuth } from "@/contexts/AuthContext";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function groomerDisplay(a: GroomingAppointmentWithJoins): string {
  return a.grooming_notes?.trim() || "—";
}

function formatDuration(min: number | null): string {
  if (min == null) return "—";
  return `${min} min`;
}

type Props = {
  todayStr: string;
  active: boolean;
};

export function GroomingHistory({ todayStr, active }: Props) {
  const { session } = useAuth();
  const deleteGroomingAppt = useDeleteGroomingAppointment();
  const { data: rows = [], isLoading } = useGroomingHistoryList(todayStr, active);

  const [searchDog, setSearchDog] = useState("");
  const [searchOwner, setSearchOwner] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<GroomingAppointmentWithJoins | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const dog = r.pets?.name?.toLowerCase() ?? "";
      const owner = r.owners
        ? `${r.owners.first_name} ${r.owners.last_name}`.toLowerCase()
        : "";
      if (searchDog.trim() && !dog.includes(searchDog.trim().toLowerCase())) return false;
      if (searchOwner.trim() && !owner.includes(searchOwner.trim().toLowerCase())) return false;
      if (dateFrom && r.appointment_date < dateFrom) return false;
      if (dateTo && r.appointment_date > dateTo) return false;
      if (serviceFilter !== "all" && r.service !== serviceFilter) return false;
      if (statusFilter !== "all") {
        const norm = normalizeGroomingWorkflowStatus(r.status);
        if (statusFilter === "cancelled" && norm !== "cancelled") return false;
        if (statusFilter !== "cancelled" && norm !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, searchDog, searchOwner, dateFrom, dateTo, serviceFilter, statusFilter]);

  const handleDelete = () => {
    if (!deleteTarget || !deleteReason.trim()) return;
    const ownerName = deleteTarget.owners
      ? ownerDisplayName(deleteTarget.owners.first_name, deleteTarget.owners.last_name)
      : "Unknown";
    deleteGroomingAppt.mutate(
      {
        appointmentId: deleteTarget.id,
        appointmentDate: deleteTarget.appointment_date,
        petName: deleteTarget.pets?.name ?? "Unknown",
        ownerName,
        service: labelForGroomingService(deleteTarget.service),
        price: deleteTarget.price,
        reason: deleteReason.trim(),
        deletedByEmail: session?.user?.email ?? "unknown",
      },
      {
        onSuccess: () => {
          toast.success("Appointment deleted");
          setDeleteTarget(null);
          setDeleteReason("");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not delete appointment."),
      },
    );
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Dog name</Label>
          <Input
            placeholder="Search dog…"
            value={searchDog}
            onChange={(e) => setSearchDog(e.target.value)}
            data-testid="grooming-history-search-dog"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Owner name</Label>
          <Input
            placeholder="Search owner…"
            value={searchOwner}
            onChange={(e) => setSearchOwner(e.target.value)}
            data-testid="grooming-history-search-owner"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From date</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To date</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Service</Label>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              <SelectItem value="full_groom">Full groom</SelectItem>
              <SelectItem value="full_bath">Full bath</SelectItem>
              <SelectItem value="nail_clip">Nail clip</SelectItem>
              <SelectItem value="deshedding">Deshedding</SelectItem>
              <SelectItem value="brushing">Brushing</SelectItem>
              <SelectItem value="pawdicure">Pawdicure</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="checked_in">Checked in</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Dog</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Groomer</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No appointments match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(r.appointment_date), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{r.pets?.name ?? "—"}</TableCell>
                    <TableCell>
                      {r.owners
                        ? ownerDisplayName(r.owners.first_name, r.owners.last_name)
                        : "—"}
                    </TableCell>
                    <TableCell>{labelForGroomingService(r.service)}</TableCell>
                    <TableCell>{groomerDisplay(r)}</TableCell>
                    <TableCell>{formatDuration(r.duration_minutes)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded border px-2 py-0.5 text-xs font-medium",
                          workflowStatusBadgeClass(r.status),
                        )}
                      >
                        {workflowStatusLabel(r.status)}
                        {r.no_show ? " · No show" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.price != null ? `AED ${r.price}` : "—"}
                    </TableCell>
                    <TableCell>
                      {normalizeGroomingWorkflowStatus(r.status) === "cancelled" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteTarget(r);
                            setDeleteReason("");
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cancelled appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the appointment record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="grooming-history-delete-reason">
              Reason for deletion <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="grooming-history-delete-reason"
              placeholder="Enter reason..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteReason.trim() || deleteGroomingAppt.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
