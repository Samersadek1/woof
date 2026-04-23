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
import { Search, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateStaff,
  useStaff,
  useUpdateStaff,
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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<StaffInsert>({ ...INITIAL_FORM });

  const { data: staff = [], isLoading } = useStaff(debouncedSearch || undefined);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const setField = (field: keyof StaffInsert, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = (e: React.FormEvent) => {
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

    createStaff.mutate(payload, {
      onSuccess: () => {
        toast.success("Staff member created.");
        setDrawerOpen(false);
        setForm({ ...INITIAL_FORM });
      },
      onError: (err) => {
        toast.error(err.message || "Failed to create staff member.");
      },
    });
  };

  const handleRoleChange = (row: StaffRow, role: StaffRole) => {
    updateStaff.mutate(
      { id: row.id, patch: { role } },
      {
        onSuccess: () => toast.success(`${fullName(row)} role updated.`),
        onError: (err) => toast.error(err.message || "Failed to update role."),
      },
    );
  };

  const handleActiveToggle = (row: StaffRow, active: boolean) => {
    updateStaff.mutate(
      { id: row.id, patch: { active } },
      {
        onSuccess: () => toast.success(`${fullName(row)} ${active ? "activated" : "deactivated"}.`),
        onError: (err) => toast.error(err.message || "Failed to update status."),
      },
    );
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
          <Button onClick={() => setDrawerOpen(true)} className="shrink-0">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={ROLE_BADGE[row.role]}>
                          {ROLE_LABELS[row.role]}
                        </Badge>
                        <Select
                          value={row.role}
                          onValueChange={(value) => handleRoleChange(row, value as StaffRole)}
                          disabled={updateStaff.isPending}
                        >
                          <SelectTrigger className="h-8 w-[180px] text-xs">
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
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={row.active}
                        onCheckedChange={(checked) => handleActiveToggle(row, checked)}
                        disabled={updateStaff.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
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
              <Button type="submit" className="w-full" disabled={createStaff.isPending}>
                {createStaff.isPending ? "Creating..." : "Create user"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default StaffPage;
