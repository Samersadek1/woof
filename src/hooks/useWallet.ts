import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type WalletTransaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
type TransactionType = Database["public"]["Enums"]["transaction_type"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type { WalletTransaction };

type CreditWalletTopupRpcResult = {
  success: boolean;
  wallet_transaction_id: string;
  receipt_id: string;
  receipt_number: string | null;
  balance_after: number;
};

// ── Query keys ────────────────────────────────────────────────────────────────

export const walletQueryKeys = {
  transactions: (ownerId: string) => ["wallet_transactions", ownerId] as const,
  topupReceipts: (ownerId: string) => ["wallet-topup-receipts", ownerId] as const,
  ownerBalance: (ownerId: string) => ["owners", ownerId, "balance"] as const,
};

// ── Shared mutation payload ───────────────────────────────────────────────────

export type WalletMutationPayload = {
  owner_id: string;
  /** Absolute value — sign is applied automatically per mutation type */
  amount: number;
  notes?: string | null;
  payment_method?: PaymentMethod | null;
  staff_id?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  /** Staff name that issued a top-up; recorded on the wallet_topup_receipt. */
  issued_by?: string | null;
};

/** Atomic wallet credit via Postgres RPC — transaction, receipt, and balance update. */
async function creditWalletTopup(
  payload: WalletMutationPayload,
  transaction_type: "top_up" | "manual_topup",
): Promise<WalletTransaction> {
  const performedBy = payload.issued_by?.trim() || "reception";
  const amount = Math.abs(payload.amount);

  const { data, error } = await supabase.rpc("credit_wallet_topup", {
    p_owner_id: payload.owner_id,
    p_amount: amount,
    p_transaction_type: transaction_type,
    p_performed_by: performedBy,
    p_payment_method: payload.payment_method ?? undefined,
    p_notes: payload.notes ?? undefined,
    p_staff_id: payload.staff_id ?? undefined,
  });

  if (error) throw error;

  const result = data as CreditWalletTopupRpcResult | null;
  if (!result?.wallet_transaction_id) {
    throw new Error("Wallet top-up failed");
  }

  return {
    id: result.wallet_transaction_id,
    owner_id: payload.owner_id,
    transaction_type,
    amount,
    balance_after: result.balance_after,
    notes: payload.notes ?? null,
    payment_method: payload.payment_method ?? null,
    staff_id: payload.staff_id ?? null,
    performed_by: performedBy,
    reference_id: payload.reference_id ?? null,
    reference_type: payload.reference_type ?? null,
    invoice_id: null,
    service_type: null,
    created_at: new Date().toISOString(),
  };
}

function invalidateWalletQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  ownerId: string,
  options?: { includeOwnerWallet?: boolean },
) {
  queryClient.invalidateQueries({
    queryKey: walletQueryKeys.transactions(ownerId),
  });
  queryClient.invalidateQueries({
    queryKey: walletQueryKeys.topupReceipts(ownerId),
  });
  queryClient.invalidateQueries({ queryKey: ["owners"] });
  if (options?.includeOwnerWallet) {
    queryClient.invalidateQueries({ queryKey: ["owner_wallet", ownerId] });
  }
}

// ── Internal helper: fetch current balance, insert transaction, update owner ──

async function applyTransaction(
  payload: WalletMutationPayload,
  transaction_type: TransactionType,
  /** positive = credit, negative = debit */
  signed_amount: number
): Promise<WalletTransaction> {
  // 1. Read current balance
  const { data: owner, error: ownerErr } = await supabase
    .from("owners")
    .select("wallet_balance")
    .eq("id", payload.owner_id)
    .single();

  if (ownerErr) throw ownerErr;

  const current = owner.wallet_balance ?? 0;
  const balance_after = Math.round((current + signed_amount) * 100) / 100;

  // 2. Insert transaction row
  const { data: tx, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      owner_id: payload.owner_id,
      transaction_type,
      amount: signed_amount,
      balance_after,
      notes: payload.notes ?? null,
      payment_method: payload.payment_method ?? null,
      staff_id: payload.staff_id ?? null,
      reference_id: payload.reference_id ?? null,
      reference_type: payload.reference_type ?? null,
      performed_by: payload.issued_by?.trim() || null,
    })
    .select()
    .single();

  if (txErr) throw txErr;

  // 3. Update owner's wallet balance
  const { error: updateErr } = await supabase
    .from("owners")
    .update({ wallet_balance: balance_after })
    .eq("id", payload.owner_id);

  if (updateErr) throw updateErr;

  return tx as WalletTransaction;
}

// ── useWalletTransactions ─────────────────────────────────────────────────────

export function useWalletTransactions(ownerId: string) {
  return useQuery({
    queryKey: walletQueryKeys.transactions(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as WalletTransaction[];
    },
  });
}

// ── useWalletTopupReceipts ────────────────────────────────────────────────────

export type WalletTopupReceipt =
  Database["public"]["Tables"]["wallet_topup_receipts"]["Row"];

export function useWalletTopupReceipts(ownerId: string) {
  return useQuery({
    queryKey: walletQueryKeys.topupReceipts(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_topup_receipts")
        .select("*")
        .eq("owner_id", ownerId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WalletTopupReceipt[];
    },
  });
}

// ── useTopUpWallet ────────────────────────────────────────────────────────────

/** Credits the wallet. `amount` must be a positive number. */
export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      creditWalletTopup(payload, "top_up"),
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.owner_id);
    },
  });
}

// ── useDeductWallet ───────────────────────────────────────────────────────────

/** Debits the wallet. `amount` may be positive or negative — sign is forced negative. */
export function useDeductWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      applyTransaction(payload, "deduction", -Math.abs(payload.amount)),
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.owner_id);
    },
  });
}

// ── useMembershipFee ──────────────────────────────────────────────────────────

/** Debits a membership fee. `amount` may be positive or negative — sign is forced negative. */
export function useMembershipFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      applyTransaction(payload, "membership_fee", -Math.abs(payload.amount)),
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.owner_id);
    },
  });
}

// ── useRefundWallet ───────────────────────────────────────────────────────────

/** Credits a refund. Exported for completeness — mirrors top_up but typed as refund. */
export function useRefundWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      applyTransaction(payload, "refund", Math.abs(payload.amount)),
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.owner_id);
    },
  });
}

// ── useManualTopUpWallet ──────────────────────────────────────────────────────

/** Staff manual credit from customer profile (amount + reason/note). */
export function useManualTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      creditWalletTopup(payload, "manual_topup"),
    onSuccess: (_data, variables) => {
      invalidateWalletQueries(queryClient, variables.owner_id, {
        includeOwnerWallet: true,
      });
    },
  });
}
