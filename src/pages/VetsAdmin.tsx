import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import TopBar from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
  useCreateVetClinic,
  useDeleteVetClinic,
  useUpdateVetClinic,
  useVetClinicsQuery,
  type VetClinicRow,
} from "@/hooks/useVetClinics";

type ClinicForm = {
  name: string;
  phone: string;
  is_active: boolean;
};

const EMPTY_FORM: ClinicForm = { name: "", phone: "", is_active: true };

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Something went wrong";
}

function ClinicFormFields({
  form,
  setForm,
  disabled,
  idPrefix,
}: {
  form: ClinicForm;
  setForm: (f: ClinicForm) => void;
  disabled: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_name`}>
          Clinic name <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${idPrefix}_name`}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_phone`}>Phone</Label>
        <Input
          id={`${idPrefix}_phone`}
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor={`${idPrefix}_active`} className="cursor-pointer">
          Active (shown in dropdowns)
        </Label>
        <Switch
          id={`${idPrefix}_active`}
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          disabled={disabled}
        />
      </div>
    </>
  );
}

const VetsAdminPage = () => {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ClinicForm>({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<VetClinicRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VetClinicRow | null>(null);

  const clinicsQ = useVetClinicsQuery();
  const createClinic = useCreateVetClinic();
  const updateClinic = useUpdateVetClinic();
  const deleteClinic = useDeleteVetClinic();

  const clinics = clinicsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [clinics, search]);

  const busy = createClinic.isPending || updateClinic.isPending;

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setCreateOpen(true);
  }

  function openEdit(row: VetClinicRow) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      is_active: row.is_active,
    });
    setEditOpen(true);
  }

  function submitCreate() {
    const name = form.name.trim();
    if (!name) return;
    createClinic.mutate(
      { name, phone: form.phone.trim() || null, is_active: form.is_active },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setForm({ ...EMPTY_FORM });
          toast.success("Vet clinic added");
        },
        onError: (e) => toast.error(extractErrorMessage(e)),
      },
    );
  }

  function submitEdit() {
    if (!editing) return;
    const name = form.name.trim();
    if (!name) return;
    updateClinic.mutate(
      {
        id: editing.id,
        name,
        phone: form.phone.trim() || null,
        is_active: form.is_active,
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          setEditing(null);
          toast.success("Vet clinic updated");
        },
        onError: (e) => toast.error(extractErrorMessage(e)),
      },
    );
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteClinic.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("Vet clinic deleted");
        setPendingDelete(null);
      },
      onError: (e) => toast.error(extractErrorMessage(e)),
    });
  }

  return (
    <>
      <TopBar title="Vet clinics" />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">Vet clinics</h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                Manage clinics staff can select when adding owners and pets. Inactive clinics stay on existing records
                but are hidden from dropdowns.
              </p>
            </div>
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add clinic
            </Button>
          </div>

          {clinicsQ.isError && (
            <Alert variant="destructive">
              <AlertTitle>Could not load vet clinics</AlertTitle>
              <AlertDescription>
                {extractErrorMessage(clinicsQ.error)}. Run the latest Supabase migration for{" "}
                <code className="rounded bg-muted px-1 text-xs">vet_clinics</code>.
              </AlertDescription>
            </Alert>
          )}

          <motionSearchField search={search} setSearch={setSearch} />

          {clinicsQ.isLoading ? (
            <Skeleton className="h-96 w-full rounded-md" />
          ) : (
            <motionClinicsTable
              filtered={filtered}
              search={search}
              openEdit={openEdit}
              setPendingDelete={setPendingDelete}
              deleteClinic={deleteClinic}
            />
          )}

          <p className="text-xs text-muted-foreground">
            {filtered.length} of {clinics.length} clinic{clinics.length !== 1 ? "s" : ""}
          </p>
        </div>
      </main>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add vet clinic</SheetTitle>
            <SheetDescription>Add a clinic staff can pick when recording vet details.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <ClinicFormFields form={form} setForm={setForm} disabled={busy} idPrefix="create" />
            <Button
              type="button"
              className="w-full"
              disabled={!form.name.trim() || createClinic.isPending}
              onClick={() => void submitCreate()}
            >
              {createClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add clinic
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit vet clinic</SheetTitle>
            <SheetDescription>Update clinic name, phone, or active status.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <ClinicFormFields form={form} setForm={setForm} disabled={busy} idPrefix="edit" />
            <Button
              type="button"
              className="w-full"
              disabled={!form.name.trim() || updateClinic.isPending}
              onClick={() => void submitEdit()}
            >
              {updateClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vet clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{pendingDelete?.name}</strong>? Existing owner and pet records keep their saved vet name;
              they will no longer see this clinic in the dropdown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteClinic.isPending}
              onClick={() => void confirmDelete()}
            >
              {deleteClinic.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

function motionSearchField({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search clinics…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

function motionClinicsTable({
  filtered,
  search,
  openEdit,
  setPendingDelete,
  deleteClinic,
}: {
  filtered: VetClinicRow[];
  search: string;
  openEdit: (row: VetClinicRow) => void;
  setPendingDelete: (row: VetClinicRow | null) => void;
  deleteClinic: ReturnType<typeof useDeleteVetClinic>;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {search.trim() ? "No clinics match your search." : "No vet clinics yet."}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
                <TableCell>
                  {row.is_active ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${row.name}`}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Delete ${row.name}`}
                      disabled={deleteClinic.isPending}
                      onClick={() => setPendingDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default VetsAdminPage;
