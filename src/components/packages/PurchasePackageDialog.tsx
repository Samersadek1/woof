import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PET_SIZE_COLUMNS, formatPackageIncludes } from "@/lib/packageCatalog";
import { useGroomingPackageCatalog } from "@/hooks/useGroomingPackages";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type Pet = Pick<Database["public"]["Tables"]["pets"]["Row"], "id" | "name" | "size" | "coat_type" | "species" | "active">;
type PackageDef = Database["public"]["Tables"]["package_definitions"]["Row"];
type PackagePricing = Database["public"]["Tables"]["package_pricing"]["Row"];

type PurchaseResult = Database["public"]["Functions"]["purchase_package"]["Returns"][number];
type PackageCreditGrant = Database["public"]["Tables"]["package_credit_grants"]["Row"];

const CATEGORY_LABELS: Record<string, string> = {
  daycare: "Daycare",
  grooming: "Grooming",
  treadmill: "Treadmill",
};

type Props = {
  ownerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (invoiceId: string) => void;
};

function resolvePetAmount(rows: PackagePricing[], pet: Pet): number | null {
  const candidates = rows
    .filter((r) => r.is_active)
    .filter((r) => r.pet_size === null || r.pet_size === pet.size)
    .filter((r) => r.coat_type === null || r.coat_type === pet.coat_type)
    .sort((a, b) => {
      const aScore = Number(a.pet_size !== null) + Number(a.coat_type !== null);
      const bScore = Number(b.pet_size !== null) + Number(b.coat_type !== null);
      return bScore - aScore;
    });
  return candidates[0]?.amount_aed ?? null;
}

export function PurchasePackageDialog({ ownerId, isOpen, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [selectedPackageCode, setSelectedPackageCode] = useState<string>("");
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: packageDefs = [], isLoading: packageDefsLoading } = useQuery({
    queryKey: ["package_definitions", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_definitions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PackageDef[];
    },
    enabled: isOpen,
  });

  const { data: packagePricing = [] } = useQuery({
    queryKey: ["package_pricing", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_pricing")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as PackagePricing[];
    },
    enabled: isOpen,
  });

  const { data: packageCreditGrants = [] } = useQuery({
    queryKey: ["package_credit_grants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("package_credit_grants").select("*");
      if (error) throw error;
      return (data ?? []) as PackageCreditGrant[];
    },
    enabled: isOpen,
  });

  const { data: groomingCatalog = [] } = useGroomingPackageCatalog(isOpen);

  const { data: pets = [], isLoading: petsLoading } = useQuery({
    queryKey: ["pets", ownerId, "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id,name,size,coat_type,species,active")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pet[];
    },
    enabled: isOpen && !!ownerId,
  });

  const selectedPackage = useMemo(
    () => packageDefs.find((pkg) => pkg.code === selectedPackageCode) ?? null,
    [packageDefs, selectedPackageCode],
  );

  const selectedGroomingCatalog = useMemo(
    () => groomingCatalog.find((pkg) => pkg.code === selectedPackageCode) ?? null,
    [groomingCatalog, selectedPackageCode],
  );

  const selectedPackageIncludes = useMemo(() => {
    if (!selectedPackage) return "";
    const grants = packageCreditGrants.filter((grant) => grant.package_def_id === selectedPackage.id);
    return formatPackageIncludes(grants);
  }, [packageCreditGrants, selectedPackage]);

  const packagePrices = useMemo(() => {
    if (!selectedPackage) return [];
    return packagePricing.filter((row) => row.package_def_id === selectedPackage.id && row.is_active);
  }, [packagePricing, selectedPackage]);

  const perPetPreview = useMemo(() => {
    if (!selectedPackage) return [];
    return pets
      .filter((pet) => selectedPetIds.includes(pet.id))
      .map((pet) => ({
        pet,
        amount: resolvePetAmount(packagePrices, pet),
      }));
  }, [pets, selectedPetIds, packagePrices, selectedPackage]);

  const subtotal = useMemo(
    () => perPetPreview.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    [perPetPreview],
  );
  const discount = useMemo(() => {
    if (!selectedPackage || selectedPetIds.length < 2) return 0;
    return Math.round((subtotal * selectedPackage.multi_pet_discount_pct) * 100) / 10000;
  }, [selectedPackage, selectedPetIds.length, subtotal]);
  const total = subtotal - discount;

  const groupedByCategory = useMemo(() => {
    const buckets: Record<string, PackageDef[]> = { daycare: [], grooming: [], treadmill: [] };
    for (const pkg of packageDefs) {
      const key = pkg.category in buckets ? pkg.category : "daycare";
      buckets[key].push(pkg);
    }
    return buckets;
  }, [packageDefs]);

  const togglePet = (petId: string, checked: boolean) => {
    setSelectedPetIds((prev) => (checked ? Array.from(new Set([...prev, petId])) : prev.filter((id) => id !== petId)));
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      toast.error("Select a package first.");
      return;
    }
    if (selectedPetIds.length === 0) {
      toast.error("Select at least one pet.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.rpc("purchase_package", {
      p_owner_id: ownerId,
      p_package_code: selectedPackage.code,
      p_pet_ids: selectedPetIds,
      p_payment_method: paymentMethod,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message || "Package purchase failed.");
      return;
    }

    const result = (data ?? [])[0] as PurchaseResult | undefined;
    if (!result) {
      toast.error("Purchase completed but no result returned.");
      return;
    }

    toast.success(`Package purchased. Invoice ${result.invoice_id.slice(0, 8)} · AED ${Number(result.total_amount_aed).toFixed(2)}`);
    queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    queryClient.invalidateQueries({ queryKey: ["owners"] });
    queryClient.invalidateQueries({ queryKey: ["pets", ownerId] });
    onSuccess?.(result.invoice_id);
    setSelectedPetIds([]);
    setSelectedPackageCode("");
    setPaymentMethod("card");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Purchase Package</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">1) Select package</h4>
            {packageDefsLoading ? (
              <p className="text-sm text-muted-foreground">Loading packages…</p>
            ) : (
              <div data-testid="purchase-pkg-definition-select" className="grid gap-3">
                {Object.entries(groupedByCategory).map(([category, defs]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category] ?? category}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {defs.map((pkg) => {
                        const minPrice = packagePricing
                          .filter((r) => r.package_def_id === pkg.id && r.is_active)
                          .reduce<number | null>((acc, cur) => (acc === null ? cur.amount_aed : Math.min(acc, cur.amount_aed)), null);
                        return (
                          <button
                            key={pkg.id}
                            data-testid={`purchase-pkg-definition-${pkg.code}`}
                            type="button"
                            className={`rounded-md border p-3 text-left transition ${
                              selectedPackageCode === pkg.code ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                            }`}
                            onClick={() => setSelectedPackageCode(pkg.code)}
                          >
                            <p className="font-medium">{pkg.display_name}</p>
                            <p className="text-xs text-muted-foreground">{pkg.description ?? "No description"}</p>
                            {pkg.category === "grooming" ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                {groomingCatalog.find((row) => row.id === pkg.id)?.includes ?? "Size-tier pricing applies"}
                              </p>
                            ) : null}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{pkg.validity_months} month{pkg.validity_months === 1 ? "" : "s"}</Badge>
                              {minPrice !== null ? <Badge variant="secondary">from AED {minPrice.toFixed(2)}</Badge> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {selectedPackage?.category === "grooming" && selectedGroomingCatalog ? (
            <>
              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Grooming package rates</h4>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Package</TableHead>
                        {PET_SIZE_COLUMNS.map((col) => (
                          <TableHead key={col.size} className="text-right">
                            {col.label}
                          </TableHead>
                        ))}
                        <TableHead className="text-center">Validity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-sm font-medium">{selectedGroomingCatalog.display_name}</TableCell>
                        {PET_SIZE_COLUMNS.map((col) => (
                          <TableCell key={col.size} className="text-right text-sm tabular-nums">
                            {selectedGroomingCatalog.prices[col.size]
                              ? `AED ${selectedGroomingCatalog.prices[col.size]!.amount_aed.toFixed(2)}`
                              : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          <Badge variant="outline">{selectedGroomingCatalog.validity_months}m</Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                {selectedPackageIncludes ? (
                  <p className="text-xs text-muted-foreground">Includes: {selectedPackageIncludes}</p>
                ) : null}
              </section>
              <Separator />
            </>
          ) : null}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">2) Select pet(s)</h4>
            {petsLoading ? (
              <p className="text-sm text-muted-foreground">Loading pets…</p>
            ) : (
              <div className="space-y-2">
                {pets.map((pet) => {
                  const speciesAllowed = selectedPackage
                    ? selectedPackage.applicable_species.includes(pet.species)
                    : true;
                  const sizeRequired = packagePrices.some((p) => p.pet_size !== null);
                  const sizeBlocked = sizeRequired && !pet.size;
                  const disabled = !speciesAllowed || sizeBlocked;
                  const checked = selectedPetIds.includes(pet.id);
                  return (
                    <div key={pet.id} className={`flex items-center justify-between rounded-md border p-3 ${disabled ? "opacity-60" : ""}`}>
                      <div>
                        <p className="font-medium">{pet.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pet.species} · {pet.size ?? "size unset"} · {pet.coat_type ?? "coat unset"}
                        </p>
                        {!speciesAllowed ? <p className="text-xs text-destructive">Species not eligible for this package.</p> : null}
                        {sizeBlocked ? <p className="text-xs text-destructive">Set pet size before purchasing this package.</p> : null}
                      </div>
                      <Checkbox
                        data-testid={`purchase-pkg-pet-checkbox-${pet.id}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(v) => togglePet(pet.id, v === true)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">3) Price preview</h4>
            <div className="rounded-md border p-3 space-y-1 text-sm">
              {perPetPreview.map((row) => (
                <div key={row.pet.id} className="flex items-center justify-between">
                  <span>{row.pet.name}</span>
                  <span>{row.amount == null ? "No pricing match" : `AED ${row.amount.toFixed(2)}`}</span>
                </div>
              ))}
              <Separator />
              <div data-testid="purchase-pkg-subtotal" className="flex items-center justify-between"><span>Subtotal</span><span>AED {subtotal.toFixed(2)}</span></div>
              {selectedPetIds.length >= 2 ? (
                <div data-testid="purchase-pkg-discount" className="flex items-center justify-between text-emerald-700">
                  <span>Multi-pet {selectedPackage?.multi_pet_discount_pct ?? 10}% discount</span>
                  <span>- AED {discount.toFixed(2)}</span>
                </div>
              ) : null}
              <div data-testid="purchase-pkg-total" className="flex items-center justify-between font-semibold"><span>Total</span><span>AED {total.toFixed(2)}</span></div>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">4) Confirm</h4>
            <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Validity starts from purchase date ({format(new Date(), "dd MMM yyyy")}).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
              <Button
                data-testid="purchase-pkg-confirm-btn"
                onClick={handlePurchase}
                disabled={isSubmitting || !selectedPackageCode || selectedPetIds.length === 0}
              >
                {isSubmitting ? "Purchasing..." : "Purchase"}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

