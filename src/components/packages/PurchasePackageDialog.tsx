import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useIssueCustomDaycarePackage, type CustomPackageLineItem } from "@/hooks/useDaycare";
import { PaymentSplitDialog } from "@/components/billing/PaymentSplitDialog";
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

import { INVOICE_PAYMENT_METHOD_OPTIONS, type PaymentMethod } from "@/lib/paymentMethod";
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

const CUSTOM_MULTI_PET_DISCOUNT_PCT = 10;

type SaleMode = "catalog" | "custom";

type CustomLineDraft = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function emptyCustomLine(): CustomLineDraft {
  return { id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "0" };
}

type Props = {
  ownerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (invoiceId: string) => void;
  /** Daycare sell flow: staff can issue custom allowance/price (including AED 0). */
  allowCustomDaycare?: boolean;
  /**
   * Restrict the catalog picker to a single package category (e.g. "grooming").
   * Leave unset to show every category (the OwnerProfile all-category behavior).
   */
  categoryFilter?: PackageDef["category"];
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

export function PurchasePackageDialog({
  ownerId,
  isOpen,
  onClose,
  onSuccess,
  allowCustomDaycare = false,
  categoryFilter,
}: Props) {
  const queryClient = useQueryClient();
  const issueCustom = useIssueCustomDaycarePackage();
  const [saleMode, setSaleMode] = useState<SaleMode>("catalog");
  const [selectedPackageCode, setSelectedPackageCode] = useState<string>("");
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customUnits, setCustomUnits] = useState("1");
  const [customAmount, setCustomAmount] = useState("0");
  const [customLineItems, setCustomLineItems] = useState<CustomLineDraft[]>([]);
  const [customValidityMonths, setCustomValidityMonths] = useState("6");
  const [customServiceCode, setCustomServiceCode] = useState<"daycare_full_day" | "daycare_hourly">(
    "daycare_full_day",
  );
  const [issueDate, setIssueDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [payment, setPayment] = useState<{ invoiceId: string; total: number; ownerId: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  // After a package sale, the purchase RPC already creates an `issued` invoice
  // linked to its purchase_group. For paid packages we flip it to `outstanding`
  // and collect via the wallet-first split modal (trigger → finalised when fully
  // paid). AED 0 / complimentary packages skip the payment step entirely.
  const finishSale = async (invoiceId: string, total: number) => {
    if (total > 0) {
      await supabase
        .from("invoices")
        .update({ status: "outstanding" })
        .eq("id", invoiceId)
        .in("status", ["issued", "draft"]);
      setPayment({ invoiceId, total, ownerId });
      setPayOpen(true);
    } else {
      onSuccess?.(invoiceId);
    }
    resetForm();
    onClose();
  };

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

  const availablePackageDefs = useMemo(
    () => (categoryFilter ? packageDefs.filter((pkg) => pkg.category === categoryFilter) : packageDefs),
    [packageDefs, categoryFilter],
  );

  const selectedPackage = useMemo(
    () => availablePackageDefs.find((pkg) => pkg.code === selectedPackageCode) ?? null,
    [availablePackageDefs, selectedPackageCode],
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
    for (const pkg of availablePackageDefs) {
      const key = pkg.category in buckets ? pkg.category : "daycare";
      buckets[key].push(pkg);
    }
    return buckets;
  }, [availablePackageDefs]);

  const togglePet = (petId: string, checked: boolean) => {
    setSelectedPetIds((prev) => (checked ? Array.from(new Set([...prev, petId])) : prev.filter((id) => id !== petId)));
  };

  const customUnitsNum = Math.max(1, Math.min(365, parseInt(customUnits, 10) || 1));
  const customAmountNum = Math.max(0, parseFloat(customAmount) || 0);
  const customValidityNum = Math.max(1, Math.min(36, parseInt(customValidityMonths, 10) || 6));
  const customDaycareSubtotal = customAmountNum * selectedPetIds.length;

  const resolvedCustomLines = useMemo(
    () =>
      customLineItems.map((line) => {
        const quantity = Math.max(1, parseInt(line.quantity, 10) || 1);
        const unitPrice = Math.max(0, parseFloat(line.unitPrice) || 0);
        return {
          ...line,
          quantity,
          unitPrice,
          lineTotal: Math.round(quantity * unitPrice * 100) / 100,
        };
      }),
    [customLineItems],
  );

  const customAddonsSubtotal = useMemo(
    () => resolvedCustomLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [resolvedCustomLines],
  );
  const customDiscount = useMemo(() => {
    if (selectedPetIds.length < 2 || customDaycareSubtotal === 0) return 0;
    return Math.round((customDaycareSubtotal * CUSTOM_MULTI_PET_DISCOUNT_PCT) * 100) / 10000;
  }, [selectedPetIds.length, customDaycareSubtotal]);
  const customTotal = customDaycareSubtotal - customDiscount + customAddonsSubtotal;

  const patchCustomLine = (id: string, patch: Partial<CustomLineDraft>) => {
    setCustomLineItems((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addCustomLine = () => {
    setCustomLineItems((prev) => [...prev, emptyCustomLine()]);
  };

  const removeCustomLine = (id: string) => {
    setCustomLineItems((prev) => prev.filter((line) => line.id !== id));
  };

  const resetForm = () => {
    setSelectedPetIds([]);
    setSelectedPackageCode("");
    setPaymentMethod("card");
    setSaleMode("catalog");
    setCustomLabel("");
    setCustomUnits("1");
    setCustomAmount("0");
    setCustomLineItems([]);
    setCustomValidityMonths("6");
    setCustomServiceCode("daycare_full_day");
    setIssueDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleCustomIssue = async () => {
    const label = customLabel.trim();
    if (!label) {
      toast.error("Enter a package label (shown on the package card).");
      return;
    }
    if (selectedPetIds.length === 0) {
      toast.error("Select at least one pet.");
      return;
    }

    const lineItems: CustomPackageLineItem[] = [];
    for (const line of resolvedCustomLines) {
      const description = line.description.trim();
      if (!description) {
        toast.error("Each additional service line needs a description.");
        return;
      }
      lineItems.push({
        description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
      });
    }

    issueCustom.mutate(
      {
        owner_id: ownerId,
        pet_ids: selectedPetIds,
        units: customUnitsNum,
        amount_aed: customAmountNum,
        label,
        line_items: lineItems.length > 0 ? lineItems : undefined,
        validity_months: customValidityNum,
        payment_method: paymentMethod,
        service_code: customServiceCode,
        issue_date: issueDate,
      },
      {
        onSuccess: async (result) => {
          if (!result?.invoice_id) {
            toast.error("Package issued but no result returned.");
            return;
          }
          const total = Number(result.total_amount_aed);
          toast.success(
            total === 0
              ? `Custom package issued (${customUnitsNum} day${customUnitsNum === 1 ? "" : "s"}, complimentary).`
              : `Custom package issued. Invoice ${result.invoice_id.slice(0, 8)} · AED ${total.toFixed(2)}`,
          );
          queryClient.invalidateQueries({ queryKey: ["service_credits"] });
          queryClient.invalidateQueries({ queryKey: ["owner_active_credits"] });
          queryClient.invalidateQueries({ queryKey: ["owners"] });
          queryClient.invalidateQueries({ queryKey: ["pets", ownerId] });
          await finishSale(result.invoice_id, total);
        },
        onError: (err) => toast.error(err.message || "Could not issue custom package."),
      },
    );
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
      p_issue_date: issueDate,
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

    const purchaseTotal = Number(result.total_amount_aed);
    toast.success(`Package purchased. Invoice ${result.invoice_id.slice(0, 8)} · AED ${purchaseTotal.toFixed(2)}`);
    queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    queryClient.invalidateQueries({ queryKey: ["owner_active_credits"] });
    queryClient.invalidateQueries({ queryKey: ["owners"] });
    queryClient.invalidateQueries({ queryKey: ["pets", ownerId] });
    await finishSale(result.invoice_id, purchaseTotal);
  };

  const isCustom = allowCustomDaycare && saleMode === "custom";
  const busy = isSubmitting || issueCustom.isPending;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isCustom ? "Custom daycare package" : "Purchase Package"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {allowCustomDaycare ? (
            <Tabs
              value={saleMode}
              onValueChange={(v) => {
                setSaleMode(v as SaleMode);
                setSelectedPackageCode("");
                setSelectedPetIds([]);
                setCustomLineItems([]);
                setCustomAmount("0");
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="catalog" data-testid="purchase-pkg-tab-catalog">
                  Catalog package
                </TabsTrigger>
                <TabsTrigger value="custom" data-testid="purchase-pkg-tab-custom">
                  Custom daycare
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {isCustom ? (
            <section className="space-y-3 rounded-md border p-4">
              <h4 className="text-sm font-semibold">Package details</h4>
              <p className="text-xs text-muted-foreground">
                Create a one-off daycare allowance for this client (e.g. bonus 1-day package at AED 0).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="custom-pkg-label">Label</Label>
                  <Input
                    id="custom-pkg-label"
                    data-testid="purchase-pkg-custom-label"
                    placeholder="e.g. Complimentary 1 daycare day"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-pkg-units">Day allowance (per pet)</Label>
                  <Input
                    id="custom-pkg-units"
                    type="number"
                    min={1}
                    max={365}
                    data-testid="purchase-pkg-custom-units"
                    value={customUnits}
                    onChange={(e) => setCustomUnits(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-pkg-amount">Price per pet (AED)</Label>
                  <Input
                    id="custom-pkg-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    data-testid="purchase-pkg-custom-amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Credit type</Label>
                  <Select
                    value={customServiceCode}
                    onValueChange={(v) => setCustomServiceCode(v as "daycare_full_day" | "daycare_hourly")}
                  >
                    <SelectTrigger data-testid="purchase-pkg-custom-service">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daycare_full_day">Full day</SelectItem>
                      <SelectItem value="daycare_hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-pkg-validity">Validity (months)</Label>
                  <Input
                    id="custom-pkg-validity"
                    type="number"
                    min={1}
                    max={36}
                    data-testid="purchase-pkg-custom-validity"
                    value={customValidityMonths}
                    onChange={(e) => setCustomValidityMonths(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-medium">Additional services (optional)</h5>
                    <p className="text-xs text-muted-foreground">
                      Add extra charges on top of daycare (e.g. grooming, transport). Multi-pet discount does not apply to these.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="purchase-pkg-custom-add-line"
                    onClick={addCustomLine}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add line
                  </Button>
                </div>
                {customLineItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                    No additional services. Daycare is billed at the per-pet price above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {customLineItems.map((line, index) => (
                      <div
                        key={line.id}
                        className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_88px_120px_auto]"
                        data-testid={`purchase-pkg-custom-line-${index}`}
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Input
                            data-testid={`purchase-pkg-custom-line-desc-${index}`}
                            placeholder="e.g. Nail trim"
                            value={line.description}
                            onChange={(e) => patchCustomLine(line.id, { description: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            data-testid={`purchase-pkg-custom-line-qty-${index}`}
                            value={line.quantity}
                            onChange={(e) => patchCustomLine(line.id, { quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit price (AED)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            data-testid={`purchase-pkg-custom-line-price-${index}`}
                            value={line.unitPrice}
                            onChange={(e) => patchCustomLine(line.id, { unitPrice: e.target.value })}
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-testid={`purchase-pkg-custom-line-remove-${index}`}
                            onClick={() => removeCustomLine(line.id)}
                            aria-label="Remove line item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {customTotal === 0 ? (
                <p className="text-xs text-muted-foreground">
                  AED 0 packages are marked paid automatically — no payment collection step.
                </p>
              ) : null}
            </section>
          ) : (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">1) Select package</h4>
            {packageDefsLoading ? (
              <p className="text-sm text-muted-foreground">Loading packages…</p>
            ) : (
              <div data-testid="purchase-pkg-definition-select" className="grid gap-3">
                {Object.entries(groupedByCategory).map(([category, defs]) => (
                  defs.length === 0 ? null : (
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
                  )
                ))}
              </div>
            )}
          </section>
          )}

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
                  const speciesAllowed =
                    isCustom || !selectedPackage
                      ? true
                      : selectedPackage.applicable_species.includes(pet.species);
                  const sizeRequired = !isCustom && packagePrices.some((p) => p.pet_size !== null);
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
              {isCustom ? (
                <>
                  {pets
                    .filter((p) => selectedPetIds.includes(p.id))
                    .map((pet) => (
                      <div key={pet.id} className="flex items-center justify-between">
                        <span>
                          {pet.name} · {customUnitsNum}{" "}
                          {customServiceCode === "daycare_hourly" ? "hour(s)" : "day(s)"}
                        </span>
                        <span>AED {customAmountNum.toFixed(2)}</span>
                      </div>
                    ))}
                  {resolvedCustomLines.map((line, index) => (
                    <div key={line.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {line.description.trim() || `Additional ${index + 1}`}
                        {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">AED {line.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div data-testid="purchase-pkg-subtotal" className="flex items-center justify-between">
                    <span>Daycare subtotal</span>
                    <span>AED {customDaycareSubtotal.toFixed(2)}</span>
                  </div>
                  {selectedPetIds.length >= 2 && customDiscount > 0 ? (
                    <div data-testid="purchase-pkg-discount" className="flex items-center justify-between text-emerald-700">
                      <span>Multi-pet {CUSTOM_MULTI_PET_DISCOUNT_PCT}% discount (daycare only)</span>
                      <span>- AED {customDiscount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {customAddonsSubtotal > 0 ? (
                    <div className="flex items-center justify-between">
                      <span>Additional services</span>
                      <span>AED {customAddonsSubtotal.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div data-testid="purchase-pkg-total" className="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span>AED {customTotal.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  {perPetPreview.map((row) => (
                    <div key={row.pet.id} className="flex items-center justify-between">
                      <span>{row.pet.name}</span>
                      <span>{row.amount == null ? "No pricing match" : `AED ${row.amount.toFixed(2)}`}</span>
                    </div>
                  ))}
                  <Separator />
                  <div data-testid="purchase-pkg-subtotal" className="flex items-center justify-between">
                    <span>Subtotal</span>
                    <span>AED {subtotal.toFixed(2)}</span>
                  </div>
                  {selectedPetIds.length >= 2 ? (
                    <div data-testid="purchase-pkg-discount" className="flex items-center justify-between text-emerald-700">
                      <span>Multi-pet {selectedPackage?.multi_pet_discount_pct ?? 10}% discount</span>
                      <span>- AED {discount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div data-testid="purchase-pkg-total" className="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span>AED {total.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">4) Confirm</h4>
            <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
              <Label>Purchase date</Label>
              <Input type="date" value={issueDate} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Validity starts from purchase date ({format(parseISO(issueDate), "dd MMM yyyy")}).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              {isCustom ? (
                <Button
                  data-testid="purchase-pkg-custom-confirm-btn"
                  onClick={handleCustomIssue}
                  disabled={
                    busy ||
                    !customLabel.trim() ||
                    selectedPetIds.length === 0 ||
                    customLineItems.some((line) => !line.description.trim())
                  }
                >
                  {issueCustom.isPending ? "Issuing…" : "Issue package"}
                </Button>
              ) : (
                <Button
                  data-testid="purchase-pkg-confirm-btn"
                  onClick={handlePurchase}
                  disabled={busy || !selectedPackageCode || selectedPetIds.length === 0}
                >
                  {isSubmitting ? "Purchasing..." : "Purchase"}
                </Button>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>

      {payment ? (
        <PaymentSplitDialog
          open={payOpen}
          onOpenChange={(v) => {
            setPayOpen(v);
            if (!v) {
              onSuccess?.(payment.invoiceId);
              setPayment(null);
            }
          }}
          invoiceId={payment.invoiceId}
          ownerId={payment.ownerId}
          invoiceTotal={payment.total}
          title="Collect package payment"
          onSuccess={() => onSuccess?.(payment.invoiceId)}
        />
      ) : null}
    </>
  );
}

