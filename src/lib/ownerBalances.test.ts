import { describe, expect, it } from "vitest";
import { computePeriodTotals } from "@/lib/ownerBalances";

describe("computePeriodTotals", () => {
  it("chains balances over visible rows so debits reconcile with net movement", () => {
    const rows = [
      {
        row_id: "opening",
        amount: 0,
        balance_after: 287,
        is_opening_balance: true,
        is_visible: true,
      },
      {
        row_id: "inv:1",
        amount: -105,
        balance_after: 182,
        is_opening_balance: false,
        is_visible: true,
      },
      {
        row_id: "inv:2",
        amount: -126,
        balance_after: 56,
        is_opening_balance: false,
        is_visible: true,
      },
    ];

    const totals = computePeriodTotals(rows);
    expect(totals.opening).toBe(287);
    expect(totals.closing).toBe(56);
    expect(totals.credits).toBe(0);
    expect(totals.debits).toBe(231);
    expect(totals.netMovement).toBe(-231);
    expect(totals.netMovement).toBe(totals.credits - totals.debits);
  });

  it("skips stale hidden wallet-payment rows from credit/debit summaries", () => {
    const rows = [
      {
        row_id: "opening",
        amount: 0,
        balance_after: 500,
        is_opening_balance: true,
        is_visible: true,
      },
      {
        row_id: "inv:1",
        amount: -63,
        balance_after: 437,
        is_opening_balance: false,
        is_visible: true,
      },
      {
        // Wallet payments no longer reach the ledger; guard against stale rows.
        row_id: "pay:hidden-wallet",
        amount: 63,
        balance_after: 437,
        is_opening_balance: false,
        is_visible: false,
      },
    ];

    const totals = computePeriodTotals(rows);
    expect(totals.credits).toBe(0);
    expect(totals.debits).toBe(63);
    expect(totals.closing).toBe(437);
    expect(totals.netMovement).toBe(-63);
  });
});
