import { describe, expect, it } from "vitest";
import {
  checkoutInvoiceFinalizePatch,
  groomingInvoiceLineDescription,
} from "./groomingCheckoutInvoice";

describe("groomingInvoiceLineDescription", () => {
  it("includes primary service, pet name, and formatted date", () => {
    expect(
      groomingInvoiceLineDescription({
        service: "full_groom",
        notes: "Services: Nail Clip\nGrooming date: 2026-06-20",
        petName: "Bella",
        appointmentDate: "2026-06-20",
      }),
    ).toBe("Full Groom + Nail Clip — Bella — 20 Jun 2026");
  });
});

describe("checkoutInvoiceFinalizePatch", () => {
  const dueDate = "2026-06-20";

  it("flips draft to outstanding when total is positive", () => {
    expect(checkoutInvoiceFinalizePatch("draft", 150, dueDate)).toEqual({
      status: "outstanding",
      due_date: dueDate,
    });
  });

  it("marks zero-total invoices as paid", () => {
    const patch = checkoutInvoiceFinalizePatch("draft", 0, dueDate);
    expect(patch?.status).toBe("paid");
    expect(patch?.paid_at).toBeTruthy();
  });

  it("is idempotent for already outstanding invoices", () => {
    expect(checkoutInvoiceFinalizePatch("outstanding", 150, dueDate)).toBeNull();
  });

  it("is idempotent for already paid invoices", () => {
    expect(checkoutInvoiceFinalizePatch("paid", 0, dueDate)).toBeNull();
  });

  it("does not regress partially paid invoices", () => {
    expect(checkoutInvoiceFinalizePatch("partially_paid", 150, dueDate)).toBeNull();
  });
});
