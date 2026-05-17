import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { resolveBoardingRate } from "@/lib/boardingPricing";
import { getPricingAmountByKey, groomingServiceToPricingKey, resolveAddonPricesForKeys } from "@/lib/addonPricing";
import {
  type TransportZone,
  normalizeStoredTransportZone,
  transportPricingKey,
  transportZoneLabel,
} from "@/lib/transportPricing";
import {
  useRefundWallet,
  type WalletMutationPayload,
} from "@/hooks/useWallet";
import {
  grandTotalFromNet,
  invoiceAmountDue,
  invoiceDisplayTotals,
  vatAmountFromNet,
} from "@/lib/vatConfig";

// ── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "draft"
  | "finalised"
  | "issued"
  | "paid"
  | "partially_paid"
  | "outstanding"
  | "overdue"
  | "voided"
  | "cancelled";

export type PaymentMethod = "wallet" | "card" | "cash";

export type ServiceType =
  | "boarding"
  | "grooming"
  | "daycare"
  | "park"
  | "transport"
  | "membership"
  | "package"
  | "adjustment";

export type AdjustmentType =
  | "price_override"
  | "refund_override"
  | "discount_override"
  | "fee_waived"
  | "goodwill_credit"
  | "cancellation_refund";

export interface LineItem {
  pricingKey: string;
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface BillingBreakdown {
  lineItems: LineItem[];
  subtotal: number;
  discountPct: number;
  discountAed: number;
  total: number;
  memberType: string;
}

export interface LineItemRow {
  id: string;
  pricing_key: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  /** Mapped from total_price — the DB column is total_price */
  line_total: number;
  sort_order: number;
}

export interface InvoiceWithItems {
  id: string;
  invoice_number: string | null;
  owner_id: string;
  service_type: string | null;
  service_id: string | null;
  status: InvoiceStatus;
  subtotal_aed: number;
  discount_pct: number;
  discount_aed: number;
  /** Stored invoice total: gross incl. VAT when vat_aed is set; legacy ex-VAT when vat_aed is null. */
  total: number;
  total_aed: number;
  vat_aed: number | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  created_at: string;
  line_items: LineItemRow[];
  booking_ref: string | null;
  booking_check_in: string | null;
  booking_check_out: string | null;
}

export interface StatementRow {
  invoice_id: string;
  invoice_number: string | null;
  service_type: string | null;
  status: string;
  total_aed: number;
  created_at: string;
  due_date: string | null;
  days_overdue: number;
}

export interface BillingAdjustment {
  id: string;
  owner_id: string;
  booking_id: string | null;
  invoice_id: string | null;
  adjustment_type: string;
  original_amount: number | null;
  adjusted_amount: number | null;
  reason: string;
  approved_by: string;
  created_at: string;
}

export interface CancellationRefund {
  hoursNotice: number;
  refundPct: number;
  refundAed: number;
  overrideActive: boolean;
  policyLabel: string;
}

// ── Formatting helper ────────────────────────────────────────────────────────

export function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const billingKeys = {
  pricing: () => ["pricing"] as const,
  invoices: (ownerId: string, filters?: Record<string, string>) =>
    ["invoices", ownerId, filters ?? {}] as const,
  statement: (ownerId: string) => ["statement", ownerId] as const,
  adjustments: (ownerId?: string) =>
    ["billing_adjustments", ownerId ?? "all"] as const,
  cancellationRefund: (
    ownerId: string | null,
    invoiceId: string | null,
    serviceStart: string | null,
  ) => ["cancellation_refund", ownerId, invoiceId, serviceStart] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 1: usePricing
// ═══════════════════════════════════════════════════════════════════════════════

interface PricingRow {
  key: string;
  amount_aed: number;
  label: string;
  category: string;
  updated_at: string;
}

export function usePricing() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: billingKeys.pricing(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing")
        .select("key, amount_aed, label, category, updated_at")
        .order("category")
        .order("key");
      if (error) throw error;
      return data as PricingRow[];
    },
  });

  const prices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of query.data ?? []) map[r.key] = r.amount_aed;
    return map;
  }, [query.data]);

  const getPrice = (key: string): number => prices[key] ?? 0;

  const updatePrice = async (key: string, amount: number) => {
    const { error } = await supabase
      .from("pricing")
      .update({ amount_aed: amount, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: billingKeys.pricing() });
  };

  /** Update price, or insert the row when the key is not in the database yet. */
  const upsertPricingPrice = async (item: {
    key: string;
    label: string;
    category: string;
    amount_aed: number;
  }) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("pricing").upsert(
      {
        key: item.key.trim(),
        label: item.label.trim(),
        category: item.category.trim(),
        amount_aed: item.amount_aed,
        updated_at: now,
      },
      { onConflict: "key" },
    );
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: billingKeys.pricing() });
  };

  const updatePrices = async (updates: Record<string, number>) => {
    const now = new Date().toISOString();
    for (const [key, amount_aed] of Object.entries(updates)) {
      const { error } = await supabase
        .from("pricing")
        .update({ amount_aed, updated_at: now })
        .eq("key", key);
      if (error) throw new Error(`Failed to update "${key}": ${error.message}`);
    }
    queryClient.invalidateQueries({ queryKey: billingKeys.pricing() });
    toast.success("Pricing saved");
  };

  const createPricingItem = async (item: {
    key: string;
    label: string;
    category: string;
    amount_aed: number;
  }) => {
    const { error } = await supabase.from("pricing").insert({
      key: item.key.trim(),
      label: item.label.trim(),
      category: item.category.trim(),
      amount_aed: item.amount_aed,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: billingKeys.pricing() });
    toast.success("Pricing item added");
  };

  const deletePricingItem = async (key: string) => {
    const { error } = await supabase.from("pricing").delete().eq("key", key);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: billingKeys.pricing() });
    toast.success("Pricing item deleted");
  };

  return {
    prices,
    allRows: query.data ?? [],
    getPrice,
    updatePrice,
    upsertPricingPrice,
    updatePrices,
    createPricingItem,
    deletePricingItem,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 1b: useServiceRates — aggregated view of all service rate tables
// ═══════════════════════════════════════════════════════════════════════════════

export interface GroomingRateRow { id: string; service: string; label: string; price_aed: number; duration_minutes: number | null; is_active: boolean }
export interface ParkRateRow { id: string; label: string; price_per_slot_aed: number; is_active: boolean }
export interface DaycarePackageTypeRow { id: string; name: string; total_days: number; base_price_aed: number; is_active: boolean; sort_order: number }
export interface AddonRateRow { id: string; addon_type: string; label: string; price_aed: number; unit: string; applicable_services: string[]; is_active: boolean }

export function useServiceRates() {
  const groomingQuery = useQuery({
    queryKey: ["grooming_service_rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grooming_service_rates").select("*").order("service");
      if (error) throw error;
      return data as GroomingRateRow[];
    },
  });

  const parkQuery = useQuery({
    queryKey: ["park_rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("park_rates").select("*");
      if (error) throw error;
      return data as ParkRateRow[];
    },
  });

  const daycareQuery = useQuery({
    queryKey: ["daycare_package_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("daycare_package_types").select("*").order("sort_order");
      if (error) throw error;
      return data as DaycarePackageTypeRow[];
    },
  });

  const addonQuery = useQuery({
    queryKey: ["addon_rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("addon_rates").select("*").order("addon_type");
      if (error) throw error;
      return data as AddonRateRow[];
    },
  });

  const queryClient = useQueryClient();

  const updateGroomingRate = async (id: string, price_aed: number) => {
    const { error } = await supabase.from("grooming_service_rates").update({ price_aed, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["grooming_service_rates"] });
  };

  const updateParkRate = async (id: string, price_per_slot_aed: number) => {
    const { error } = await supabase.from("park_rates").update({ price_per_slot_aed, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["park_rates"] });
  };

  const updateDaycareType = async (id: string, base_price_aed: number) => {
    const { error } = await supabase.from("daycare_package_types").update({ base_price_aed, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["daycare_package_types"] });
  };

  const updateAddonRate = async (id: string, price_aed: number) => {
    const { error } = await supabase.from("addon_rates").update({ price_aed, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["addon_rates"] });
  };

  return {
    groomingRates: groomingQuery.data ?? [],
    parkRates: parkQuery.data ?? [],
    daycarePackageTypes: daycareQuery.data ?? [],
    addonRates: addonQuery.data ?? [],
    updateGroomingRate,
    updateParkRate,
    updateDaycareType,
    updateAddonRate,
    isLoading: groomingQuery.isLoading || parkQuery.isLoading || daycareQuery.isLoading || addonQuery.isLoading,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 2: useBillingCalculator (reads from service-specific rate tables)
// ═══════════════════════════════════════════════════════════════════════════════

type ServiceParams =
  | {
      type: "boarding";
      roomId: string;
      petCount: number;
      nights: number;
      addons?: { addonType: string; label: string; qty?: number }[];
    }
  | { type: "grooming"; service: string }
  | { type: "park"; slots?: number }
  | { type: "daycare_package"; packageTypeId: string; pickup?: boolean; dropoff?: boolean; transportZone?: TransportZone | string | null }
  | { type: "membership"; pricingKey: string };

export function useBillingCalculator(
  ownerId: string | null,
  params: ServiceParams | null,
): { breakdown: BillingBreakdown | null; isLoading: boolean } {
  const discountQuery = useQuery({
    queryKey: ["member_discount_v2", ownerId, params],
    enabled: !!ownerId && !!params,
    queryFn: async () => {
      if (!ownerId || !params) return null;

      const lineItems: LineItem[] = [];

      switch (params.type) {
        case "boarding": {
          const occ = params.petCount <= 1 ? "single" : params.petCount === 2 ? "twin" : "multiple";
          const resolved = await resolveBoardingRate(params.roomId, params.petCount);
          const rate = resolved.unitPrice;
          lineItems.push({ pricingKey: resolved.pricingKey, label: `Room (${occ})`, quantity: params.nights, unitPrice: rate, total: rate * params.nights });

          if (params.addons?.length) {
            const priceMap = await resolveAddonPricesForKeys(params.addons.map((a) => a.addonType));
            for (const a of params.addons) {
              const p = priceMap.get(a.addonType) ?? 0;
              const q = a.qty ?? 1;
              lineItems.push({ pricingKey: a.addonType, label: a.label, quantity: q, unitPrice: p, total: p * q });
            }
          }
          break;
        }
        case "grooming": {
          const { data: rate } = await supabase
            .from("grooming_service_rates")
            .select("price_aed, label")
            .eq("service", params.service as Database["public"]["Enums"]["grooming_service"])
            .single();
          let p = rate?.price_aed ?? 0;
          let label = rate?.label ?? params.service;
          const pk = groomingServiceToPricingKey(params.service);
          if (pk) {
            const live = await getPricingAmountByKey(pk);
            if (live != null) {
              p = live;
              if (!rate?.label) label = pk.replace(/^grooming_/, "").replace(/_/g, " ");
            }
          }
          lineItems.push({ pricingKey: `grooming:${params.service}`, label, quantity: 1, unitPrice: p, total: p });
          break;
        }
        case "park": {
          const slotFromPricing = await getPricingAmountByKey("park_slot");
          const { data: rates } = await supabase.from("park_rates").select("price_per_slot_aed").eq("is_active", true).limit(1);
          const p = slotFromPricing ?? rates?.[0]?.price_per_slot_aed ?? 0;
          const slots = params.slots ?? 1;
          lineItems.push({ pricingKey: "park:slot", label: "Park slot", quantity: slots, unitPrice: p, total: p * slots });
          break;
        }
        case "daycare_package": {
          const { data: pkgType } = await supabase
            .from("daycare_package_types").select("name, total_days, base_price_aed").eq("id", params.packageTypeId).single();
          if (pkgType) {
            lineItems.push({ pricingKey: `daycare:${pkgType.name}`, label: pkgType.name, quantity: 1, unitPrice: pkgType.base_price_aed, total: pkgType.base_price_aed });
            if (params.pickup || params.dropoff) {
              const zone: TransportZone =
                normalizeStoredTransportZone(params.transportZone ?? null) ?? "dubai_shared";
              if (zone !== "complimentary") {
                const tKey = transportPricingKey(zone);
                const tMap = await resolveAddonPricesForKeys([tKey]);
                const tp = tMap.get(tKey) ?? 0;
                const zoneLabel = transportZoneLabel(zone);
                if (params.pickup)
                  lineItems.push({
                    pricingKey: tKey,
                    label: `Pickup (${zoneLabel}) × ${pkgType.total_days}`,
                    quantity: pkgType.total_days,
                    unitPrice: tp,
                    total: tp * pkgType.total_days,
                  });
                if (params.dropoff)
                  lineItems.push({
                    pricingKey: tKey,
                    label: `Drop-off (${zoneLabel}) × ${pkgType.total_days}`,
                    quantity: pkgType.total_days,
                    unitPrice: tp,
                    total: tp * pkgType.total_days,
                  });
              }
            }
          }
          break;
        }
        case "membership": {
          const { getPrice } = await loadPricingMap();
          const p = getPrice(params.pricingKey);
          lineItems.push({ pricingKey: params.pricingKey, label: params.pricingKey.replace(/_/g, " "), quantity: 1, unitPrice: p, total: p });
          break;
        }
      }

      const subtotal = lineItems.reduce((s, li) => s + li.total, 0);

      let disc = { discount_pct: 0, discount_aed: 0, final_aed: subtotal };
      try {
        const { data: discData } = await supabase.rpc("apply_member_discount", { p_owner_id: ownerId, p_subtotal: subtotal });
        const row = (discData as { discount_pct: number; discount_aed: number; final_aed: number }[])?.[0];
        if (row) disc = row;
      } catch { /* proceed without discount */ }

      const { data: ownerData } = await supabase.from("owners").select("member_type").eq("id", ownerId).single();

      return {
        lineItems,
        subtotal,
        discountPct: disc.discount_pct,
        discountAed: disc.discount_aed,
        total: disc.final_aed,
        memberType: ownerData?.member_type ?? "standard",
      } satisfies BillingBreakdown;
    },
  });

  return {
    breakdown: discountQuery.data ?? null,
    isLoading: discountQuery.isLoading,
  };
}

async function loadPricingMap() {
  const { data } = await supabase.from("pricing").select("key, amount_aed");
  const map: Record<string, number> = {};
  for (const r of data ?? []) map[r.key] = r.amount_aed;
  return { getPrice: (k: string) => map[k] ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 3: useCreateInvoice
// ═══════════════════════════════════════════════════════════════════════════════

interface CreateInvoiceInput {
  ownerId: string;
  serviceType: ServiceType;
  serviceId?: string;
  breakdown: BillingBreakdown;
  notes?: string;
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const normalizedItems: LineItem[] = [];
      for (const li of input.breakdown.lineItems) {
        const qty = Math.max(1, li.quantity);
        let unitPrice = li.unitPrice;
        if (li.pricingKey) {
          try {
            const { data } = await supabase.rpc("resolve_line_price", {
              p_pricing_key: li.pricingKey,
              p_quantity: qty,
            });
            const row = (data as { unit_price: number; total: number }[])?.[0];
            if (row && typeof row.unit_price === "number" && typeof row.total === "number") {
              unitPrice = row.unit_price;
            }
          } catch {
            // Keep client-provided prices when RPC isn't available for a key.
          }
        }
        normalizedItems.push({
          ...li,
          quantity: qty,
          unitPrice,
          total: unitPrice * qty,
        });
      }

      const normalizedSubtotal = normalizedItems.reduce((sum, li) => sum + li.total, 0);
      let normalizedDiscountAed = 0;
      let normalizedDiscountPct = 0;
      let normalizedTotal = normalizedSubtotal;
      try {
        const { data: discData } = await supabase.rpc("apply_member_discount", {
          p_owner_id: input.ownerId,
          p_subtotal: normalizedSubtotal,
        });
        const row = (discData as { discount_pct: number; discount_aed: number; final_aed: number }[])?.[0];
        if (row) {
          normalizedDiscountPct = row.discount_pct;
          normalizedDiscountAed = row.discount_aed;
          normalizedTotal = row.final_aed;
        }
      } catch {
        // Leave raw totals if discount RPC unavailable.
      }

      const netExVat = normalizedTotal;
      const vatAed = vatAmountFromNet(netExVat);
      const grossTotal = grandTotalFromNet(netExVat);

      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          owner_id: input.ownerId,
          booking_id: input.serviceId ?? null,
          service_type: input.serviceType,
          status: "draft" as const,
          subtotal: normalizedSubtotal,
          subtotal_aed: normalizedSubtotal,
          discount_pct: normalizedDiscountPct,
          discount_aed: normalizedDiscountAed,
          discount_amount: normalizedDiscountAed,
          total: grossTotal,
          total_aed: grossTotal,
          vat_aed: vatAed,
          due_date: dueDate,
          notes: input.notes ?? null,
        })
        .select("id, invoice_number")
        .single();

      if (invErr) throw invErr;

      const lineRows = normalizedItems.map((li, i) => ({
        invoice_id: inv.id,
        description: li.label,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        total_price: li.total,
        pricing_key: li.pricingKey ?? null,
        service_type: input.serviceType,
        sort_order: i,
      }));

      if (lineRows.length > 0) {
        const { error: liErr } = await supabase
          .from("invoice_line_items")
          .insert(lineRows);
        if (liErr) throw liErr;
      }

      return {
        invoiceId: inv.id as string,
        invoiceNumber: inv.invoice_number as string | null,
        total: grossTotal,
      };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["invoices", variables.ownerId],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create invoice");
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 4: useFinaliseInvoice
// ═══════════════════════════════════════════════════════════════════════════════

export function useFinaliseInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status: "finalised" as const })
        .eq("id", invoiceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 5: useProcessPayment
// ═══════════════════════════════════════════════════════════════════════════════

interface ProcessPaymentInput {
  invoiceId: string;
  method: PaymentMethod;
  staffName: string;
}

interface ProcessPaymentResult {
  success: boolean;
  method: PaymentMethod;
  amountCharged: number;
  newWalletBalance?: number;
  error?: string;
  shortfall?: number;
}

export function useProcessPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ProcessPaymentInput,
    ): Promise<ProcessPaymentResult> => {
      if (input.method === "wallet") {
        const { data, error: rpcErr } = await supabase.rpc("process_wallet_payment", {
          p_invoice_id: input.invoiceId,
          p_performed_by: input.staffName,
        });

        // If RPC exists and succeeded, use its result
        if (!rpcErr) {
          const result = data as {
            success: boolean;
            amount_charged?: number;
            new_balance?: number;
            error?: string;
            shortfall?: number;
          };

          if (result.success) {
            toast.success(`${formatAed(result.amount_charged!)} deducted from wallet`);
          } else {
            toast.error(result.error ?? (result.shortfall ? `Insufficient balance — shortfall of ${formatAed(result.shortfall)}` : "Wallet payment failed"));
          }

          return {
            success: result.success,
            method: "wallet",
            amountCharged: result.amount_charged ?? 0,
            newWalletBalance: result.new_balance,
            error: result.error,
            shortfall: result.shortfall,
          };
        }

        // Fallback: client-side wallet deduction (used before process_wallet_payment RPC is deployed)
        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .select("owner_id, total, total_aed, vat_aed")
          .eq("id", input.invoiceId)
          .single();
        if (invErr) throw invErr;

        const { data: ownerRow, error: ownerErr } = await supabase
          .from("owners")
          .select("wallet_balance")
          .eq("id", inv.owner_id)
          .single();
        if (ownerErr) throw ownerErr;

        const amount = invoiceAmountDue({
          total: inv.total,
          total_aed: inv.total_aed,
          vat_aed: inv.vat_aed,
        });
        const currentBalance = ownerRow.wallet_balance ?? 0;

        if (currentBalance < amount) {
          const shortfall = amount - currentBalance;
          toast.error(`Insufficient balance — shortfall of ${formatAed(shortfall)}`);
          return { success: false, method: "wallet", amountCharged: 0, shortfall };
        }

        const newBalance = Math.round((currentBalance - amount) * 100) / 100;

        await supabase.from("owners").update({ wallet_balance: newBalance }).eq("id", inv.owner_id);
        await supabase.from("invoices").update({
          status: "paid" as const,
          payment_method: "wallet",
          amount_paid: amount,
        }).eq("id", input.invoiceId);
        await supabase.from("wallet_transactions").insert({
          owner_id: inv.owner_id,
          transaction_type: "deduction" as const,
          amount: -amount,
          balance_after: newBalance,
          notes: `Invoice payment via wallet — ${input.staffName}`,
          reference_id: input.invoiceId,
          reference_type: "invoice",
        });

        toast.success(`${formatAed(amount)} deducted from wallet`);
        return { success: true, method: "wallet", amountCharged: amount, newWalletBalance: newBalance };
      }

      // Card or cash payment
      const { data: invoice, error: fetchErr } = await supabase
        .from("invoices")
        .select("owner_id, total, total_aed, vat_aed")
        .eq("id", input.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;

      const amount = invoiceAmountDue({
        total: invoice.total,
        total_aed: invoice.total_aed,
        vat_aed: invoice.vat_aed,
      });

      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          status: "paid" as const,
          payment_method: input.method,
          amount_paid: amount,
        })
        .eq("id", input.invoiceId);
      if (updateErr) throw updateErr;

      // Record audit trail transaction (non-blocking — may fail if schema migration not yet run)
      try {
        const { data: owner } = await supabase
          .from("owners")
          .select("wallet_balance")
          .eq("id", invoice.owner_id)
          .single();

        const txType = input.method === "card" ? "card_payment" : "cash_payment";
        await supabase.from("wallet_transactions").insert({
          owner_id: invoice.owner_id,
          amount: 0,
          balance_after: owner?.wallet_balance ?? 0,
          transaction_type: txType as "card_payment" | "cash_payment",
          invoice_id: input.invoiceId,
          performed_by: input.staffName,
          notes: `Paid by ${input.method}`,
        });
      } catch {
        // Audit trail insert failed (likely schema migration not yet applied) — payment itself succeeded
        console.warn("Audit trail insert skipped — run sql/fix-invoice-schema.sql to enable full audit logging");
      }

      toast.success(`${formatAed(amount)} recorded — paid by ${input.method}`);

      return {
        success: true,
        method: input.method,
        amountCharged: amount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 6: useVoidInvoice
// ═══════════════════════════════════════════════════════════════════════════════

interface VoidInvoiceInput {
  invoiceId: string;
  reason: string;
  refundAmount: number;
  staffName: string;
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();
  const refundWallet = useRefundWallet();

  return useMutation({
    mutationFn: async (
      input: VoidInvoiceInput,
    ): Promise<{ success: boolean; refundAed: number }> => {
      const { data: invoice, error: fetchErr } = await supabase
        .from("invoices")
        .select("owner_id, total, total_aed, vat_aed")
        .eq("id", input.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: voidErr } = await supabase
        .from("invoices")
        .update({
          status: "cancelled" as const,
          notes: input.reason,
        })
        .eq("id", input.invoiceId);
      if (voidErr) throw voidErr;

      if (input.refundAmount > 0) {
        const payload: WalletMutationPayload = {
          owner_id: invoice.owner_id,
          amount: input.refundAmount,
          notes: input.reason,
          reference_id: input.invoiceId,
          reference_type: "invoice_void",
        };
        await refundWallet.mutateAsync(payload);
      }

      await supabase.from("billing_adjustments").insert({
        owner_id: invoice.owner_id,
        invoice_id: input.invoiceId,
        adjustment_type: "cancellation_refund",
        original_amount: invoiceAmountDue({
          total: invoice.total,
          total_aed: invoice.total_aed,
          vat_aed: invoice.vat_aed,
        }),
        adjusted_amount: input.refundAmount,
        reason: input.reason,
        approved_by: input.staffName,
      });

      if (input.refundAmount > 0) {
        toast.success(
          `Invoice voided. ${formatAed(input.refundAmount)} refunded to wallet.`,
        );
      } else {
        toast.success("Invoice voided. No refund applied.");
      }

      return { success: true, refundAed: input.refundAmount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing_adjustments"] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 7: useCalculateCancellationRefund
// ═══════════════════════════════════════════════════════════════════════════════

export function useCalculateCancellationRefund(
  ownerId: string | null,
  invoiceId: string | null,
  serviceStart: string | null,
): { data: CancellationRefund | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: billingKeys.cancellationRefund(ownerId, invoiceId, serviceStart),
    enabled: !!ownerId && !!invoiceId && !!serviceStart,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "calculate_cancellation_refund",
        {
          p_owner_id: ownerId!,
          p_invoice_id: invoiceId!,
          p_service_start: serviceStart!,
        },
      );
      if (error) throw error;

      const row = (data as {
        hours_notice: number;
        refund_pct: number;
        refund_aed: number;
        override_active: boolean;
        policy_label: string;
      }[])?.[0];

      if (!row) return null;

      return {
        hoursNotice: row.hours_notice,
        refundPct: row.refund_pct,
        refundAed: row.refund_aed,
        overrideActive: row.override_active,
        policyLabel: row.policy_label,
      } satisfies CancellationRefund;
    },
  });

  return { data: query.data ?? null, isLoading: query.isLoading };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 8: useWalletTopUp — re-export from useWallet.ts
// ═══════════════════════════════════════════════════════════════════════════════

export { useTopUpWallet as useWalletTopUp } from "@/hooks/useWallet";

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 9: useOwnerStatement
// ═══════════════════════════════════════════════════════════════════════════════

export function useOwnerStatement(ownerId: string) {
  const queryClient = useQueryClient();

  const statementQuery = useQuery({
    queryKey: billingKeys.statement(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_statement_of_account", {
        p_owner_id: ownerId,
      });
      // Fall back to direct query if RPC not yet deployed
      if (error) {
        const { data: rows, error: qErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, total, total_aed, vat_aed, created_at, due_date, booking_id")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false });
        if (qErr) throw qErr;
        return (rows ?? []).map((r) => ({
          invoice_id: r.id,
          invoice_number: r.invoice_number,
          service_type: null as string | null,
          status: r.status,
          total_aed: invoiceDisplayTotals({
            total: r.total,
            total_aed: r.total_aed,
            vat_aed: r.vat_aed,
          }).grandTotal,
          created_at: r.created_at,
          due_date: r.due_date,
          days_overdue: 0,
        })) as StatementRow[];
      }
      return (data ?? []) as StatementRow[];
    },
  });

  const ownerQuery = useQuery({
    queryKey: ["owner_wallet", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owners")
        .select("wallet_balance")
        .eq("id", ownerId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const invoices = statementQuery.data ?? [];
  const walletBalance = ownerQuery.data?.wallet_balance ?? 0;

  const UNPAID: string[] = ["draft", "finalised", "issued", "outstanding", "overdue", "partially_paid"];
  const totalOutstanding = invoices
    .filter((i) => UNPAID.includes(i.status))
    .reduce((sum, i) => sum + i.total_aed, 0);

  const netPosition = walletBalance - totalOutstanding;

  const payAllOutstanding = async () => {
    const unpaid = invoices
      .filter((i) => UNPAID.includes(i.status))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

    let cleared = 0;
    let totalDeducted = 0;

    for (const inv of unpaid) {
      const { data, error } = await supabase.rpc("process_wallet_payment", {
        p_invoice_id: inv.invoice_id,
        p_performed_by: "bulk_payment",
      });
      if (error) throw error;

      const result = data as {
        success: boolean;
        amount_charged?: number;
        error?: string;
      };

      if (!result.success) {
        toast.error(`Payment stopped: ${result.error ?? "Insufficient funds"}`);
        break;
      }

      cleared++;
      totalDeducted += result.amount_charged ?? 0;
    }

    if (cleared > 0) {
      toast.success(
        `${cleared} invoice${cleared !== 1 ? "s" : ""} cleared — ${formatAed(totalDeducted)} deducted`,
      );
    }

    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["statement"] });
    queryClient.invalidateQueries({ queryKey: ["owners"] });
    queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
  };

  return {
    invoices,
    walletBalance,
    totalOutstanding,
    netPosition,
    payAllOutstanding,
    isLoading: statementQuery.isLoading || ownerQuery.isLoading,
    error: statementQuery.error || ownerQuery.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 10: useBillingAdjustments
// ═══════════════════════════════════════════════════════════════════════════════

interface CreateAdjustmentInput {
  ownerId: string;
  bookingId?: string;
  invoiceId?: string;
  type: AdjustmentType;
  originalAmount?: number;
  adjustedAmount?: number;
  reason: string;
  approvedBy: string;
}

export function useBillingAdjustments(ownerId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: billingKeys.adjustments(ownerId),
    queryFn: async () => {
      let q = supabase
        .from("billing_adjustments")
        .select("*")
        .order("created_at", { ascending: false });

      if (ownerId) q = q.eq("owner_id", ownerId);
      else q = q.limit(100);

      const { data, error } = await q;
      if (error) throw error;
      return data as BillingAdjustment[];
    },
  });

  const createAdjustment = useMutation({
    mutationFn: async (input: CreateAdjustmentInput) => {
      const { data, error } = await supabase
        .from("billing_adjustments")
        .insert({
          owner_id: input.ownerId,
          booking_id: input.bookingId ?? null,
          invoice_id: input.invoiceId ?? null,
          adjustment_type: input.type,
          original_amount: input.originalAmount ?? null,
          adjusted_amount: input.adjustedAmount ?? null,
          reason: input.reason,
          approved_by: input.approvedBy,
        })
        .select()
        .single();
      if (error) throw error;
      return data as BillingAdjustment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing_adjustments"] });
    },
  });

  return {
    adjustments: query.data ?? [],
    createAdjustment,
    isLoading: query.isLoading,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 11: useInvoicesForOwner
// ═══════════════════════════════════════════════════════════════════════════════

export function useInvoicesForOwner(
  ownerId: string,
  filters?: { status?: InvoiceStatus; serviceType?: ServiceType },
) {
  return useQuery({
    queryKey: billingKeys.invoices(ownerId, filters as Record<string, string>),
    enabled: !!ownerId,
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, line_items:invoice_line_items(*), bookings(booking_ref, check_in_date, check_out_date)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (filters?.status) q = q.eq("status", filters.status);

      const { data, error } = await q;
      if (error) throw error;

      type RawLineItem = { id: string; description: string; quantity: number; unit_price: number; total_price: number; service_type: string | null };
      type RawBooking = { booking_ref: string | null; check_in_date: string; check_out_date: string } | null;

      return (data ?? []).map((inv) => {
        const raw = inv as Record<string, unknown>;
        const lineItems = (raw.line_items as RawLineItem[] | null) ?? [];
        const booking = raw.bookings as RawBooking;

        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          owner_id: inv.owner_id,
          service_type: inv.service_type ?? null,
          service_id: inv.booking_id,
          status: inv.status as InvoiceStatus,
          subtotal_aed: inv.subtotal_aed || inv.subtotal || 0,
          discount_pct: inv.discount_pct,
          discount_aed: inv.discount_aed || inv.discount_amount || 0,
          total: inv.total,
          total_aed: inv.total_aed ?? inv.total ?? 0,
          vat_aed: inv.vat_aed ?? null,
          payment_method: inv.payment_method as PaymentMethod | null,
          paid_at: inv.paid_at ?? (inv.status === "paid" ? inv.updated_at : null),
          due_date: inv.due_date,
          notes: inv.notes,
          voided_at: inv.voided_at ?? (inv.status === "cancelled" ? inv.updated_at : null),
          voided_reason: inv.voided_reason ?? (inv.status === "cancelled" ? inv.notes : null),
          created_at: inv.created_at,
          line_items: lineItems.map((li, idx) => ({
            id: li.id,
            pricing_key: (li as Record<string, unknown>).pricing_key as string | null ?? null,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            line_total: li.total_price,
            sort_order: (li as Record<string, unknown>).sort_order as number ?? idx,
          })),
          booking_ref: booking?.booking_ref ?? null,
          booking_check_in: booking?.check_in_date ?? null,
          booking_check_out: booking?.check_out_date ?? null,
        };
      }) as InvoiceWithItems[];
    },
  });
}
