import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useRefundWallet,
  type WalletMutationPayload,
} from "@/hooks/useWallet";

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
  total_aed: number;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  created_at: string;
  line_items: LineItemRow[];
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

  return {
    prices,
    allRows: query.data ?? [],
    getPrice,
    updatePrice,
    updatePrices,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook 2: useBillingCalculator
// ═══════════════════════════════════════════════════════════════════════════════

type ServiceParams =
  | {
      type: "boarding";
      pricingKey: string;
      nights: number;
      addons?: { pricingKey: string; label: string; qty?: number }[];
    }
  | { type: "grooming"; pricingKey: string }
  | { type: "park"; slots?: number }
  | { type: "daycare_session"; days?: number }
  | { type: "daycare_package"; pricingKey: string }
  | { type: "transport"; pricingKey: string; trips?: number }
  | { type: "membership"; pricingKey: string };

export function useBillingCalculator(
  ownerId: string | null,
  params: ServiceParams | null,
): { breakdown: BillingBreakdown | null; isLoading: boolean } {
  const { getPrice, isLoading: pricingLoading } = usePricing();

  const discountQuery = useQuery({
    queryKey: ["member_discount", ownerId, params],
    enabled: !!ownerId && !!params && !pricingLoading,
    queryFn: async () => {
      if (!ownerId || !params) return null;

      const lineItems: LineItem[] = [];

      switch (params.type) {
        case "boarding": {
          const unitPrice = getPrice(params.pricingKey);
          lineItems.push({
            pricingKey: params.pricingKey,
            label: params.pricingKey.replace(/_/g, " "),
            quantity: params.nights,
            unitPrice,
            total: unitPrice * params.nights,
          });
          for (const addon of params.addons ?? []) {
            const ap = getPrice(addon.pricingKey);
            const qty = addon.qty ?? 1;
            lineItems.push({
              pricingKey: addon.pricingKey,
              label: addon.label,
              quantity: qty,
              unitPrice: ap,
              total: ap * qty,
            });
          }
          break;
        }
        case "grooming": {
          const p = getPrice(params.pricingKey);
          lineItems.push({
            pricingKey: params.pricingKey,
            label: params.pricingKey.replace(/_/g, " "),
            quantity: 1,
            unitPrice: p,
            total: p,
          });
          break;
        }
        case "park": {
          const slots = params.slots ?? 1;
          const p = getPrice("park_slot");
          lineItems.push({
            pricingKey: "park_slot",
            label: "Park slot",
            quantity: slots,
            unitPrice: p,
            total: p * slots,
          });
          break;
        }
        case "daycare_session": {
          const days = params.days ?? 1;
          const p = getPrice("daycare_single_day");
          lineItems.push({
            pricingKey: "daycare_single_day",
            label: "Daycare day",
            quantity: days,
            unitPrice: p,
            total: p * days,
          });
          break;
        }
        case "daycare_package": {
          const p = getPrice(params.pricingKey);
          lineItems.push({
            pricingKey: params.pricingKey,
            label: params.pricingKey.replace(/_/g, " "),
            quantity: 1,
            unitPrice: p,
            total: p,
          });
          break;
        }
        case "transport": {
          const trips = params.trips ?? 1;
          const p = getPrice(params.pricingKey);
          lineItems.push({
            pricingKey: params.pricingKey,
            label: params.pricingKey.replace(/_/g, " "),
            quantity: trips,
            unitPrice: p,
            total: p * trips,
          });
          break;
        }
        case "membership": {
          const p = getPrice(params.pricingKey);
          lineItems.push({
            pricingKey: params.pricingKey,
            label: params.pricingKey.replace(/_/g, " "),
            quantity: 1,
            unitPrice: p,
            total: p,
          });
          break;
        }
      }

      const subtotal = lineItems.reduce((s, li) => s + li.total, 0);

      const { data: discData, error: discErr } = await supabase.rpc(
        "apply_member_discount",
        { p_owner_id: ownerId, p_subtotal: subtotal },
      );
      if (discErr) throw discErr;

      const disc = (discData as { discount_pct: number; discount_aed: number; final_aed: number }[])?.[0] ?? {
        discount_pct: 0,
        discount_aed: 0,
        final_aed: subtotal,
      };

      const { data: ownerData } = await supabase
        .from("owners")
        .select("member_type")
        .eq("id", ownerId)
        .single();

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
    isLoading: pricingLoading || discountQuery.isLoading,
  };
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
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          owner_id: input.ownerId,
          service_type: input.serviceType,
          service_id: input.serviceId ?? null,
          status: "draft" as const,
          subtotal_aed: input.breakdown.subtotal,
          subtotal: input.breakdown.subtotal,
          discount_pct: input.breakdown.discountPct,
          discount_aed: input.breakdown.discountAed,
          discount_amount: input.breakdown.discountAed,
          total_aed: input.breakdown.total,
          total: input.breakdown.total,
          due_date: dueDate,
          notes: input.notes ?? null,
        })
        .select("id, invoice_number")
        .single();

      if (invErr) throw invErr;

      const lineRows = input.breakdown.lineItems.map((li, idx) => ({
        invoice_id: inv.id,
        pricing_key: li.pricingKey,
        description: li.label,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        line_total: li.total,
        total_price: li.total,
        sort_order: idx,
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
        total: input.breakdown.total,
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
        const { data, error } = await supabase.rpc("process_wallet_payment", {
          p_invoice_id: input.invoiceId,
          p_performed_by: input.staffName,
        });
        if (error) throw error;

        const result = data as {
          success: boolean;
          amount_charged?: number;
          new_balance?: number;
          error?: string;
          shortfall?: number;
        };

        if (result.success) {
          toast.success(`${formatAed(result.amount_charged!)} deducted from wallet`);
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

      // Card or cash payment
      const { data: invoice, error: fetchErr } = await supabase
        .from("invoices")
        .select("owner_id, total_aed, total")
        .eq("id", input.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;

      const amount = invoice.total_aed || invoice.total;

      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          status: "paid" as const,
          payment_method: input.method,
          paid_at: new Date().toISOString(),
          amount_paid: amount,
        })
        .eq("id", input.invoiceId);
      if (updateErr) throw updateErr;

      // Record a zero-balance wallet transaction for audit trail
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
        .select("owner_id, total_aed, total")
        .eq("id", input.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: voidErr } = await supabase
        .from("invoices")
        .update({
          status: "voided" as const,
          voided_at: new Date().toISOString(),
          voided_reason: input.reason,
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
        original_amount: invoice.total_aed || invoice.total,
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
      if (error) throw error;
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

  const UNPAID: string[] = ["draft", "outstanding", "overdue", "finalised", "issued"];
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
        .select("*, line_items:invoice_line_items(*)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.serviceType)
        q = q.eq("service_type", filters.serviceType);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        owner_id: inv.owner_id,
        service_type: inv.service_type,
        service_id: inv.service_id,
        status: inv.status as InvoiceStatus,
        subtotal_aed: inv.subtotal_aed ?? inv.subtotal,
        discount_pct: inv.discount_pct,
        discount_aed: inv.discount_aed ?? inv.discount_amount,
        total_aed: inv.total_aed ?? inv.total,
        payment_method: inv.payment_method as PaymentMethod | null,
        paid_at: inv.paid_at,
        due_date: inv.due_date,
        notes: inv.notes,
        voided_at: inv.voided_at,
        voided_reason: inv.voided_reason,
        created_at: inv.created_at,
        line_items: ((inv as Record<string, unknown>).line_items as LineItemRow[]) ?? [],
      })) as InvoiceWithItems[];
    },
  });
}
