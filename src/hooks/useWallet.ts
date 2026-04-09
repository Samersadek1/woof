import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type WalletTransaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
type TransactionType = Database["public"]["Enums"]["transaction_type"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type { WalletTransaction };

// ── Query keys ────────────────────────────────────────────────────────────────

export const walletQueryKeys = {
  transactions: (ownerId: string) => ["wallet_transactions", ownerId] as const,
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
};

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

// ── useTopUpWallet ────────────────────────────────────────────────────────────

/** Credits the wallet. `amount` must be a positive number. */
export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WalletMutationPayload) =>
      applyTransaction(payload, "top_up", Math.abs(payload.amount)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.transactions(variables.owner_id),
      });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
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
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.transactions(variables.owner_id),
      });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
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
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.transactions(variables.owner_id),
      });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
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
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.transactions(variables.owner_id),
      });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}
