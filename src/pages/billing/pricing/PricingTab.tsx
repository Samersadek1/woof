import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import GroomingPricingGrid from "@/components/billing/GroomingPricingGrid";
import GroomingPackagesGrid from "@/components/billing/GroomingPackagesGrid";
import { BoardingPeakPeriodsEditor } from "@/components/billing/BoardingPeakPeriodsEditor";
import { addonRateUiGroup } from "@/lib/groomingCatalog";
import { usePricing, useServiceRates, type AddonRateRow } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CANONICAL_PRICING_KEYS, MEMBERSHIP_DISCOUNT_KEYS } from "@/pages/billing/pricing/constants";

type RateCardRow = {
  key: string;
  label: string;
  category: string;
  amount_aed: number;
  inDb: boolean;
};

const EMPTY_NEW_PRICING_ITEM = {
  label: "",
  key: "",
  category: "",
  amount_aed: "",
};

export function PricingTab() {
  const { allRows, upsertPricingPrice, createPricingItem, deletePricingItem } = usePricing();
  const { daycarePackageTypes, addonRates, updateAddonRate, isLoading } = useServiceRates();
  const [saving, setSaving] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_NEW_PRICING_ITEM);
  const [adding, setAdding] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const activeDaycarePackageTypes = useMemo(
    () =>
      daycarePackageTypes
        .filter((t) => t.is_active)
        .sort((a, b) => a.total_days - b.total_days || a.name.localeCompare(b.name)),
    [daycarePackageTypes],
  );
  const boardingRateRows = useMemo(
    () =>
      (allRows ?? [])
        .filter((r) => r.category === "boarding")
        .sort((a, b) => a.key.localeCompare(b.key)),
    [allRows],
  );

  const boardingNightSeasonRows = useMemo(() => {
    const isBoardingNight = (key: string) => key.startsWith("boarding_night:");
    const seasonOf = (key: string) => {
      const part = key.split(":")[3];
      return part && part !== "*" ? part : null;
    };
    const nightRows = boardingRateRows.filter((r) => isBoardingNight(r.key));
    const peak = nightRows.find((r) => seasonOf(r.key) === "peak");
    const offPeak = nightRows.find((r) => seasonOf(r.key) === "off_peak");
    const other = nightRows.filter((r) => {
      const s = seasonOf(r.key);
      return s !== "peak" && s !== "off_peak";
    });
    const nonNight = boardingRateRows.filter((r) => !isBoardingNight(r.key));
    return { peak, offPeak, other, nonNight };
  }, [boardingRateRows]);
  const canonicalByKey = useMemo(
    () => new Map((allRows ?? []).map((r) => [r.key, r])),
    [allRows],
  );
  const rateCardRows = useMemo((): RateCardRow[] => {
    const byKey = new Map((allRows ?? []).map((r) => [r.key, r]));
    const rows: RateCardRow[] = [];
    for (const c of CANONICAL_PRICING_KEYS) {
      if (c.category === "park") continue;
      const live = byKey.get(c.key);
      rows.push({
        key: c.key,
        label: live?.label ?? c.label,
        category: live?.category ?? c.category,
        amount_aed: live?.amount_aed ?? 0,
        inDb: !!live,
      });
    }
    for (const r of allRows ?? []) {
      if (r.category === "park" || r.key.startsWith("park_")) continue;
      if (!CANONICAL_PRICING_KEYS.some((c) => c.key === r.key)) {
        rows.push({
          key: r.key,
          label: r.label,
          category: r.category,
          amount_aed: r.amount_aed,
          inDb: true,
        });
      }
    }
    return rows;
  }, [allRows]);
  const filteredRateCardRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rateCardRows;
    return rateCardRows.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.key.toLowerCase().includes(q),
    );
  }, [rateCardRows, searchQuery]);

  const { groomingAddOnRates, transportAddOnRates, boardingAddOnRates, otherAddOnRates } = useMemo(() => {
    const grooming: AddonRateRow[] = [];
    const transport: AddonRateRow[] = [];
    const boarding: AddonRateRow[] = [];
    const other: AddonRateRow[] = [];
    for (const r of addonRates) {
      const g = addonRateUiGroup(r);
      if (g === "grooming") grooming.push(r);
      else if (g === "transport") {
        if (r.addon_type.startsWith("transport_")) transport.push(r);
        else boarding.push(r);
      }
      else other.push(r);
    }
    return {
      groomingAddOnRates: grooming,
      transportAddOnRates: transport,
      boardingAddOnRates: boarding,
      otherAddOnRates: other,
    };
  }, [addonRates]);

  const saveRate = async (type: string, id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setSaving(id);
    try {
      if (type === "addon") await updateAddonRate(id, num);
      toast.success("Rate saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveCanonicalKey = async (
    key: string,
    value: string,
    meta: { label: string; category: string },
  ) => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) return;
    setSaving(`key:${key}`);
    try {
      await upsertPricingPrice({ key, label: meta.label, category: meta.category, amount_aed: num });
      toast.success("Rate card key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const handleAddPricingItem = async () => {
    const label = addForm.label.trim();
    const key = addForm.key.trim();
    const category = addForm.category.trim();
    const amount = parseFloat(addForm.amount_aed);
    if (!label || !key || !category) {
      toast.error("Item name, key, and category are required.");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid price (0 or greater).");
      return;
    }
    if (canonicalByKey.has(key)) {
      toast.error("This key already exists. Edit the existing row or choose a different key.");
      return;
    }
    setAdding(true);
    try {
      await createPricingItem({ key, label, category, amount_aed: amount });
      setAddForm(EMPTY_NEW_PRICING_ITEM);
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add pricing item");
    } finally {
      setAdding(false);
    }
  };

  const handleDeletePricingItem = async () => {
    if (!pendingDeleteKey) return;
    setDeletingKey(pendingDeleteKey);
    try {
      await deletePricingItem(pendingDeleteKey);
      setPendingDeleteKey(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete pricing item");
    } finally {
      setDeletingKey(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3 p-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Service rates are used to auto-price bookings. Press Enter or blur to save.</p>
      <Tabs defaultValue="core" className="space-y-4" data-testid="billing-pricing-tabs">
        <TabsList>
          <TabsTrigger value="core" data-testid="billing-pricing-tab-core">Core Pricing</TabsTrigger>
          <TabsTrigger value="grooming-v2" data-testid="billing-pricing-tab-grooming-v2">Grooming (v2)</TabsTrigger>
        </TabsList>

        <TabsContent value="core" className="mt-0 space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Live Rate Card (pricing table)</CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                These keys drive live billing for transport, daycare day-pass, daycare hourly, and registration. Press Enter or blur to save price changes.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[220px]">
                  <div className="flex items-center gap-2">
                    Item
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search…"
                      className="h-7 w-28 text-xs"
                      aria-label="Search rate card items"
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[120px]">Key</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
                <TableHead className="w-[72px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRateCardRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-sm">{row.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.key}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      className="w-[140px] ml-auto text-right h-8 text-sm"
                      defaultValue={row.amount_aed}
                      onBlur={(e) => saveCanonicalKey(row.key, e.target.value, { label: row.label, category: row.category })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={saving === `key:${row.key}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.inDb ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDeleteKey(row.key)}
                        disabled={deletingKey === row.key}
                        aria-label={`Delete ${row.label}`}
                      >
                        {deletingKey === row.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddForm(EMPTY_NEW_PRICING_ITEM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add pricing item</DialogTitle>
            <DialogDescription>
              Creates a new row in the pricing table. Changes are saved immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-label">Item name</Label>
              <Input
                id="pricing-add-label"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Weekend daycare surcharge"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-key">Key</Label>
              <Input
                id="pricing-add-key"
                value={addForm.key}
                onChange={(e) => setAddForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="e.g. daycare_weekend_surcharge"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-category">Category</Label>
              <select id="pricing-add-category" value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"><option value="" disabled>Select category…</option><option value="boarding">boarding</option><option value="grooming">grooming</option><option value="transport">transport</option><option value="daycare">daycare</option><option value="membership">membership</option><option value="rule">rule</option></select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pricing-add-price">Price (AED)</Label>
              <Input
                id="pricing-add-price"
                type="number"
                min="0"
                step="0.001"
                value={addForm.amount_aed}
                onChange={(e) => setAddForm((f) => ({ ...f, amount_aed: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddPricingItem} disabled={adding}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDeleteKey}
        onOpenChange={(open) => { if (!open) setPendingDeleteKey(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pricing item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className="font-mono text-foreground">{pendingDeleteKey}</span>{" "}
              from the pricing table. Billing that references this key may break until it is re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingKey}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingKey}
              onClick={(e) => { e.preventDefault(); void handleDeletePricingItem(); }}
            >
              {deletingKey ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Membership Discounts</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Live policy used by invoices via `apply_member_discount` (database function).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Tier</TableHead>
                <TableHead className="text-right min-w-[140px]">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MEMBERSHIP_DISCOUNT_KEYS.map((row) => {
                const live = row.key ? canonicalByKey.get(row.key) : null;
                return (
                  <TableRow key={row.tier}>
                    <TableCell className="text-sm">{row.tier}</TableCell>
                    <TableCell className="text-right">
                      {row.key ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[120px] ml-auto text-right h-8 text-sm"
                          defaultValue={live?.amount_aed ?? row.defaultPct}
                          onBlur={(e) => saveCanonicalKey(row.key, e.target.value, {
                            label: live?.label ?? `${row.tier} membership discount`,
                            category: live?.category ?? "membership",
                          })}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          disabled={saving === `key:${row.key}`}
                        />
                      ) : (
                        <span className="text-sm font-medium">0%</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Boarding Rates</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Peak and off-peak night rates apply per billed night based on the peak calendar below.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[220px]">Label</TableHead>
                <TableHead className="min-w-[180px]">Key</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardingRateRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground py-6 text-center">
                    No boarding pricing keys found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {boardingNightSeasonRows.peak ? (
                    <TableRow key={boardingNightSeasonRows.peak.key}>
                      <TableCell className="text-sm font-medium">Boarding — Peak (per night)</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {boardingNightSeasonRows.peak.key}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={boardingNightSeasonRows.peak.amount_aed}
                          onBlur={(e) =>
                            saveCanonicalKey(boardingNightSeasonRows.peak!.key, e.target.value, {
                              label: boardingNightSeasonRows.peak!.label || "Boarding (per night)",
                              category: boardingNightSeasonRows.peak!.category,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${boardingNightSeasonRows.peak.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {boardingNightSeasonRows.offPeak ? (
                    <TableRow key={boardingNightSeasonRows.offPeak.key}>
                      <TableCell className="text-sm font-medium">Boarding — Off-peak (per night)</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {boardingNightSeasonRows.offPeak.key}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={boardingNightSeasonRows.offPeak.amount_aed}
                          onBlur={(e) =>
                            saveCanonicalKey(boardingNightSeasonRows.offPeak!.key, e.target.value, {
                              label: boardingNightSeasonRows.offPeak!.label || "Boarding (per night)",
                              category: boardingNightSeasonRows.offPeak!.category,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${boardingNightSeasonRows.offPeak.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {[...boardingNightSeasonRows.other, ...boardingNightSeasonRows.nonNight].map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-sm">{row.label || row.key}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.key}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-[140px] ml-auto text-right h-8 text-sm"
                          defaultValue={row.amount_aed}
                          onBlur={(e) => saveCanonicalKey(row.key, e.target.value, {
                            label: row.label || row.key,
                            category: row.category,
                          })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={saving === `key:${row.key}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
          <BoardingPeakPeriodsEditor />
        </CardContent>
      </Card>

      <Card data-testid="billing-pricing-daycare-packages">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Daycare Packages</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Read-only view of active daycare package definitions. Single-day daycare uses Rate Card keys above.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Package</TableHead>
                <TableHead className="text-right min-w-[140px]">From price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeDaycarePackageTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                    No active daycare package definitions.
                  </TableCell>
                </TableRow>
              ) : (
                activeDaycarePackageTypes.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{t.name}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{t.base_price_aed}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming Packages</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Multi-session grooming bundles (Summer Splash, Full Service, Yearly). Per-session grooming rates use the grids above.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <GroomingPackagesGrid />
        </CardContent>
      </Card>

      {/* Add-on rates — split so grooming lines stay with the grooming catalog */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Grooming</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Same catalog as boarding “groom on checkout” and grooming extras. Set <code className="text-xs">applicable_services</code> to include <code className="text-xs">grooming</code> in Supabase to classify new rows.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Add-on</TableHead>
                <TableHead className="w-20">Unit</TableHead>
                <TableHead className="min-w-[120px]">Applies to</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groomingAddOnRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground py-6 text-center">No grooming add-on rows (or all classified as transport).</TableCell>
                </TableRow>
              ) : (
                groomingAddOnRates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.applicable_services.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min="0" step="1"
                        className="w-[120px] ml-auto text-right h-8 text-sm"
                        defaultValue={r.price_aed}
                        onBlur={(e) => saveRate("addon", r.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        disabled={saving === r.id}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Boarding</CardTitle>
          <p className="text-xs text-muted-foreground font-normal pt-1">
            Boarding-only add-ons from `addon_rates`. Transport add-ons are hidden here to avoid stale values; live transport charges always come from Rate Card transport keys above.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[180px]">Add-on</TableHead>
                <TableHead className="w-20">Unit</TableHead>
                <TableHead className="min-w-[120px]">Applies to</TableHead>
                <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardingAddOnRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground py-6 text-center">No boarding add-on rows.</TableCell>
                </TableRow>
              ) : (
                boardingAddOnRates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.applicable_services.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min="0" step="1"
                        className="w-[120px] ml-auto text-right h-8 text-sm"
                        defaultValue={r.price_aed}
                        onBlur={(e) => saveRate("addon", r.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        disabled={saving === r.id}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {transportAddOnRates.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Hidden {transportAddOnRates.length} legacy transport add-on row{transportAddOnRates.length === 1 ? "" : "s"} from `addon_rates` to prevent pricing confusion. Use Rate Card keys (`transport_dubai_shared`, `transport_dubai`, `transport_abudhabi`) for live transport pricing.
        </div>
      ) : null}

      {otherAddOnRates.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add-ons — Other</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[180px]">Add-on</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="min-w-[120px]">Applies to</TableHead>
                  <TableHead className="text-right min-w-[140px]">Price (AED)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherAddOnRates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.applicable_services.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min="0" step="1"
                        className="w-[120px] ml-auto text-right h-8 text-sm"
                        defaultValue={r.price_aed}
                        onBlur={(e) => saveRate("addon", r.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        disabled={saving === r.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
        </TabsContent>

        <TabsContent value="grooming-v2" className="mt-0 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Grooming (v2) — Package × Size Grid</CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                Live 5 × 4 grid (Grande, Bijoux, Deshedding Long/Smooth, Bath & Blow across S/M/L/XL).
              </p>
            </CardHeader>
            <CardContent className="p-0" data-testid="billing-grooming-v2-grid">
              <GroomingPricingGrid />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
