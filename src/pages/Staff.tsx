import { useEffect, useState } from "react";
import TopBar from "@/components/dashboard/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaff,
  type StaffInsert,
  type StaffRole,
  type StaffRow,
} from "@/hooks/useStaff";

const ROLE_OPTIONS: StaffRole[] = [
  "admin",
  "management",
  "booking_coordinator",
  "groomer",
  "kennel_staff",
  "night_staff",
];

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  management: "Management",
  booking_coordinator: "Booking coordinator",
  groomer: "Groomer",
  kennel_staff: "Kennel staff",
  night_staff: "Night staff",
};

const ROLE_BADGE: Record<StaffRole, string> = {
  admin: "bg-rose-50 text-rose-700 border-rose-200",
  management: "bg-amber-50 text-amber-700 border-amber-200",
  booking_coordinator: "bg-blue-50 text-blue-700 border-blue-200",
  groomer: "bg-purple-50 text-purple-700 border-purple-200",
  kennel_staff: "bg-emerald-50 text-emerald-700 border-emerald-200",
  night_staff: "bg-slate-100 text-slate-700 border-slate-200",
};

const INITIAL_FORM: StaffInsert = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  role: "booking_coordinator",
  active: true,
};

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function fullName(staff: StaffRow): string {
  return [staff.first_name, staff.last_name].filter(Boolean).join(" ");
}

const StaffPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<StaffInsert>({ ...INITIAL_FORM });
  const [editForm, setEditForm] = useState<StaffInsert>({ ...INITIAL_FORM });
  const [editingRow, setEditingRow] = useState<StaffRow | null>(null);

  const { data: staff = [], isLoading } = useStaff(debouncedSearch || undefined);
  const [isInviting, setIsInviting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const setField = (field: keyof StaffInsert, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };
  const setEditField = (field: keyof StaffInsert, value: string | boolean) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    const payload: StaffInsert = {
      ...form,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
    };

    setIsInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/staff-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          firstName: payload.first_name,
          lastName: payload.last_name,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          active: payload.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to invite user.");

      toast.success(`Invite sent to ${data.invitedEmail}.`);
      setCreateOpen(false);
      setForm({ ...INITIAL_FORM });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to invite user.");
    } finally {
      setIsInviting(false);
    }
  };

  const openEdit = (row: StaffRow) => {
    setEditingRow(row);
    setEditForm({
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      role: row.role,
      active: row.active,
    });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    if (!editForm.first_name?.trim() || !editForm.last_name?.trim() || !editForm.email?.trim()) {
      toast.error("First name, last name, and email are required.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/staff-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: editingRow.id,
          firstName: editForm.first_name,
          lastName: editForm.last_name,
          email: editForm.email,
          phone: editForm.phone,
          role: editForm.role,
          active: editForm.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update user.");

      toast.success(`${fullName(editingRow)} updated.`);
      setEditOpen(false);
      setEditingRow(null);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update user.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (row: StaffRow) => {
    const confirmed = window.confirm(`Delete ${fullName(row)}? This also removes their sign-in account.`);
    if (!confirmed) return;

    setIsDeleting(row.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/staff-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete user.");

      toast.success(`${fullName(row)} deleted.`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete user.");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <>
      <TopBar title="User Management" />

      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add user
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No staff users found.
                  </TableCell>
                </TableRow>
              ) : (
                staff.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{fullName(row)}</TableCell>
                    <TableCell>{row.email || "—"}</TableCell>
                    <TableCell>{row.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_BADGE[row.role]}>
                        {ROLE_LABELS[row.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {row.active ? "Yes" : "No"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(row)}
                          disabled={isDeleting === row.id}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          {isDeleting === row.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setForm({ ...INITIAL_FORM });
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add user</SheetTitle>
            <SheetDescription>Create a new staff user record.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name *</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setField("first_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name *</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setField("role", value as StaffRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={!!form.active}
                onCheckedChange={(checked) => setField("active", checked)}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={isInviting}>
                {isInviting ? "Sending invite..." : "Invite user"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingRow(null);
            setEditForm({ ...INITIAL_FORM });
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit user</SheetTitle>
            <SheetDescription>Update staff details, role, or access status.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleEdit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit_first_name">First name *</Label>
                <Input
                  id="edit_first_name"
                  value={editForm.first_name}
                  onChange={(e) => setEditField("first_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_last_name">Last name *</Label>
                <Input
                  id="edit_last_name"
                  value={editForm.last_name}
                  onChange={(e) => setEditField("last_name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_email">Email *</Label>
              <Input
                id="edit_email"
                type="email"
                value={editForm.email ?? ""}
                onChange={(e) => setEditField("email", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                value={editForm.phone ?? ""}
                onChange={(e) => setEditField("phone", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditField("role", value as StaffRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="edit_active">Active</Label>
              <Switch
                id="edit_active"
                checked={!!editForm.active}
                onCheckedChange={(checked) => setEditField("active", checked)}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default StaffPage;
