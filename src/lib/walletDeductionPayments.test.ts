import { describe, expect, it } from "vitest";
import {
  orphanWalletDeductions,
  syntheticWalletPaymentsFromDeductions,
} from "@/lib/walletDeductionPayments";

describe("walletDeductionPayments", () => {
  it("finds wallet deductions without a linked invoice_payment", () => {
    const payments = [
      {
        id: "pay-1",
        invoice_id: "inv-1",
        amount: 50,
        payment_method: "wallet",
        created_at: "2026-06-01T10:00:00.000Z",
        wallet_transaction_id: "wt-linked",
      },
    ];
    const deductions = [
      {
        id: "wt-linked",
        invoice_id: "inv-1",
        amount: -50,
        created_at: "2026-06-01T10:00:00.000Z",
      },
      {
        id: "wt-orphan",
        invoice_id: "inv-2",
        amount: -73.5,
        created_at: "2026-06-02T10:00:00.000Z",
        notes: "Invoice payment via wallet",
      },
    ];

    const orphans = orphanWalletDeductions(payments, deductions);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe("wt-orphan");

    const synthetic = syntheticWalletPaymentsFromDeductions(orphans);
    expect(synthetic[0]).toMatchObject({
      invoice_id: "inv-2",
      amount: 73.5,
      payment_method: "wallet",
      wallet_transaction_id: "wt-orphan",
    });
  });
});
