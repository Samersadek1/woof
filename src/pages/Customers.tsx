import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { useOwners, useCreateOwner } from "@/hooks/useOwners";
import type { OwnerWithPetCount } from "@/hooks/useOwners";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MemberType = Database["public"]["Enums"]["member_type"];
type OwnerInsert = Database["public"]["Tables"]["owners"]["Insert"];

const MEMBER_BADGE_CLASSES: Record<MemberType, string> = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  silver: "bg-blue-50 text-blue-700 border-blue-200",
  gold: "bg-amber-50 text-amber-700 border-amber-200",
  platinum: "bg-violet-50 text-violet-700 border-violet-200",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const INITIAL_FORM: OwnerInsert = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  member_type: "standard",
  notes: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  vet_name: "",
  vet_phone: "",
  how_heard: "",
  emirates_id: "",
  is_vip: false,
  always_same_room: false,
  camera_required: false,
};

const CustomersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<OwnerInsert>({ ...INITIAL_FORM });
  const [pendingDelete, setPendingDelete] = useState<OwnerWithPetCount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: owners, isLoading } = useOwners(debouncedSearch || undefined);
  const createOwner = useCreateOwner();

  const handleField = (field: keyof OwnerInsert, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggle = (field: keyof OwnerInsert, value: boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOwner.mutate(form, {
      onSuccess: () => {
        toast.success("Owner created successfully");
        setDrawerOpen(false);
        setForm({ ...INITIAL_FORM });
      },
      onError: (err) => {
        toast.error(err.message || "Failed to create owner");
      },
    });
  };

  const petCount = (owner: OwnerWithPetCount) => owner.pets?.length ?? 0;

  function petSummary(owner: OwnerWithPetCount): { line: string; title: string } {
    const list = owner.pets ?? [];
    if (!list.length) return { line: "—", title: "No pets" };
    const parts = list.map((p) =>
      p.breed ? `${p.name} (${p.breed})` : p.name
    );
    const title = parts.join(", ");
    const line = title.length > 56 ? `${title.slice(0, 53)}…` : title;
    return { line, title };
  }

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const { error } = await supabase
      .from("owners")
      .delete()
      .eq("id", pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
    if (error) {
      toast.error(error.message || "Failed to delete owner");
    } else {
      toast.success("Owner deleted");
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    }
  };

  return (
    <>
      <TopBar title="Customers & Pets" />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setDrawerOpen(true)} className="ml-4 shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add Owner
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Wallet (AED)</TableHead>
                <TableHead className="text-center">Pets</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : owners?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                owners?.map((owner) => {
                  const petsInfo = petSummary(owner);
                  const n = petCount(owner);
                  return (
                    <TableRow
                      key={owner.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/customers/${owner.id}`)}
                    >
                      <TableCell className="font-medium">
                        {owner.first_name} {owner.last_name}
                      </TableCell>
                      <TableCell>{owner.phone}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={MEMBER_BADGE_CLASSES[owner.member_type]}
                        >
                          {owner.member_type.charAt(0).toUpperCase() +
                            owner.member_type.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {owner.wallet_balance.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px]"
                        title={petsInfo.title}
                      >
                        <p className="text-sm truncate">{petsInfo.line}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {n} pet{n !== 1 ? "s" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/customers/${owner.id}`);
                          }}
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          View
                        </Button>
                        {n === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete(owner);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Owner</SheetTitle>
              <SheetDescription>
                Create a new customer record.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Core */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name <span className="text-destructive">*</span></Label>
                  <Input id="first_name" required value={form.first_name} onChange={(e) => handleField("first_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name <span className="text-destructive">*</span></Label>
                  <Input id="last_name" required value={form.last_name} onChange={(e) => handleField("last_name", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone <span className="text-destructive">*</span></Label>
                  <Input id="phone" type="tel" required value={form.phone} onChange={(e) => handleField("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => handleField("email", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="member_type">Member type</Label>
                  <Select value={form.member_type ?? "standard"} onValueChange={(v) => handleField("member_type", v)}>
                    <SelectTrigger id="member_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="platinum">Platinum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emirates_id">Emirates ID</Label>
                  <Input id="emirates_id" value={form.emirates_id ?? ""} onChange={(e) => handleField("emirates_id", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" rows={2} value={form.address ?? ""} onChange={(e) => handleField("address", e.target.value)} />
              </div>

              <Separator />

              {/* Emergency contact */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emergency Contact</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ec_name">Name</Label>
                  <Input id="ec_name" value={form.emergency_contact_name ?? ""} onChange={(e) => handleField("emergency_contact_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec_phone">Phone</Label>
                  <Input id="ec_phone" type="tel" value={form.emergency_contact_phone ?? ""} onChange={(e) => handleField("emergency_contact_phone", e.target.value)} />
                </div>
              </div>

              <Separator />

              {/* Vet */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vet Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vet_name">Vet name</Label>
                  <Input id="vet_name" value={form.vet_name ?? ""} onChange={(e) => handleField("vet_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vet_phone">Vet phone</Label>
                  <Input id="vet_phone" type="tel" value={form.vet_phone ?? ""} onChange={(e) => handleField("vet_phone", e.target.value)} />
                </div>
              </div>

              <Separator />

              {/* Preferences */}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preferences</p>

              <div className="space-y-2">
                <Label htmlFor="how_heard">How did you hear about us?</Label>
                <Input id="how_heard" value={form.how_heard ?? ""} onChange={(e) => handleField("how_heard", e.target.value)} />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="is_vip" className="cursor-pointer">VIP</Label>
                <Switch id="is_vip" checked={form.is_vip ?? false} onCheckedChange={(v) => handleToggle("is_vip", v)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="always_same_room" className="cursor-pointer">Always same room</Label>
                <Switch id="always_same_room" checked={form.always_same_room ?? false} onCheckedChange={(v) => handleToggle("always_same_room", v)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="camera_required" className="cursor-pointer">Camera required</Label>
                <Switch id="camera_required" checked={form.camera_required ?? false} onCheckedChange={(v) => handleToggle("camera_required", v)} />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" rows={3} value={form.notes ?? ""} onChange={(e) => handleField("notes", e.target.value)} />
              </div>

              <Button type="submit" className="w-full" disabled={createOwner.isPending}>
                {createOwner.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Owner
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </main>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this owner?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {pendingDelete?.first_name} {pendingDelete?.last_name}
              </span>{" "}
              from the database. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {isDeleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CustomersPage;
