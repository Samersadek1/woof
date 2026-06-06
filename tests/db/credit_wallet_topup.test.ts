import { describe, expect, it } from "vitest";
import { getServiceRoleClient } from "../helpers/supabaseTestClient";
import { createTestOwner } from "../helpers/factories";
import { withScope } from "./_utils";

type CreditWalletTopupResult = {
  success: boolean;
  wallet_transaction_id: string;
  receipt_id: string;
  receipt_number: string | null;
  balance_after: number;
};

async function countOrphanTopupReceipts(): Promise<number> {
  const supabase = getServiceRoleClient();

  const { data: txs, error: txErr } = await supabase
    .from("wallet_transactions")
    .select("id")
    .in("transaction_type", ["top_up", "manual_topup"])
    .gt("amount", 0);

  if (txErr) throw txErr;

  const txIds = (txs ?? []).map((row) => row.id);
  if (txIds.length === 0) return 0;

  const { data: receipts, error: receiptErr } = await supabase
    .from("wallet_topup_receipts")
    .select("wallet_transaction_id")
    .in("wallet_transaction_id", txIds);

  if (receiptErr) throw receiptErr;

  const covered = new Set((receipts ?? []).map((row) => row.wallet_transaction_id));
  return txIds.filter((id) => !covered.has(id)).length;
}

describe("credit_wallet_topup", () => {
  it("credits wallet, creates receipt, and updates balance atomically", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope, { wallet_balance: 50 });

      const { data, error } = await supabase.rpc("credit_wallet_topup", {
        p_owner_id: owner.id,
        p_amount: 25.5,
        p_transaction_type: "top_up",
        p_performed_by: `${scope.scopeId}_Staff`,
        p_payment_method: "cash",
        p_notes: `${scope.scopeId} test top-up`,
      });
      if (error) throw error;

      const result = data as CreditWalletTopupResult;
      expect(result.success).toBe(true);
      expect(result.balance_after).toBe(75.5);
      expect(result.wallet_transaction_id).toBeTruthy();
      expect(result.receipt_id).toBeTruthy();

      const { data: ownerRow, error: ownerErr } = await supabase
        .from("owners")
        .select("wallet_balance")
        .eq("id", owner.id)
        .single();
      if (ownerErr) throw ownerErr;
      expect(ownerRow.wallet_balance).toBe(75.5);

      const { data: tx, error: txErr } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("id", result.wallet_transaction_id)
        .single();
      if (txErr) throw txErr;
      expect(tx.transaction_type).toBe("top_up");
      expect(tx.amount).toBe(25.5);
      expect(tx.balance_after).toBe(75.5);
      expect(tx.performed_by).toBe(`${scope.scopeId}_Staff`);

      const { data: receipt, error: receiptErr } = await supabase
        .from("wallet_topup_receipts")
        .select("*")
        .eq("wallet_transaction_id", result.wallet_transaction_id)
        .single();
      if (receiptErr) throw receiptErr;
      expect(receipt.id).toBe(result.receipt_id);
      expect(receipt.amount).toBe(25.5);
      expect(receipt.issued_by).toBe(`${scope.scopeId}_Staff`);
      expect(receipt.notes).toBe(`${scope.scopeId} test top-up`);

      await supabase
        .from("wallet_topup_receipts")
        .delete()
        .eq("wallet_transaction_id", result.wallet_transaction_id);
      await supabase.from("wallet_transactions").delete().eq("id", result.wallet_transaction_id);
      await supabase.from("owners").update({ wallet_balance: 50 }).eq("id", owner.id);
    });
  });

  it("creates a receipt for manual_topup via direct wallet_transactions insert", async () => {
    await withScope(async (scope) => {
      const supabase = getServiceRoleClient();
      const owner = await createTestOwner(scope, { wallet_balance: 0 });

      const { data: tx, error: txErr } = await supabase
        .from("wallet_transactions")
        .insert({
          owner_id: owner.id,
          transaction_type: "manual_topup",
          amount: 10,
          balance_after: 10,
          performed_by: `${scope.scopeId}_Trigger`,
          notes: `${scope.scopeId} trigger test`,
        })
        .select("*")
        .single();
      if (txErr) throw txErr;

      const { data: receipt, error: receiptErr } = await supabase
        .from("wallet_topup_receipts")
        .select("*")
        .eq("wallet_transaction_id", tx.id)
        .single();
      if (receiptErr) throw receiptErr;

      expect(receipt.amount).toBe(10);
      expect(receipt.issued_by).toBe(`${scope.scopeId}_Trigger`);

      await supabase.from("wallet_topup_receipts").delete().eq("wallet_transaction_id", tx.id);
      await supabase.from("wallet_transactions").delete().eq("id", tx.id);
    });
  });

  it("has no orphan top-up receipts in the database", async () => {
    const orphans = await countOrphanTopupReceipts();
    expect(orphans).toBe(0);
  });
});
