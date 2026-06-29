import { describe, expect, it } from "vitest";
import {
  canSyncGroomingAppointmentPriceToInvoice,
  checkoutInvoiceFinalizePatch,
  groomingInvoiceLineDescription,
  groomingPriceAed,
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

describe("groomingPriceAed", () => {
  it("coerces postgres numeric strings", () => {
    expect(groomingPriceAed("315")).toBe(315);
    expect(groomingPriceAed("236.25")).toBe(236.25);
  });
});

describe("canSyncGroomingAppointmentPriceToInvoice", () => {
  it("allows draft and unpaid outstanding invoices", () => {
    expect(canSyncGroomingAppointmentPriceToInvoice("draft", 0)).toBe(true);
    expect(canSyncGroomingAppointmentPriceToInvoice("outstanding", 0)).toBe(true);
    expect(canSyncGroomingAppointmentPriceToInvoice("overdue", null)).toBe(true);
  });

  it("blocks paid or partially paid invoices", () => {
    expect(canSyncGroomingAppointmentPriceToInvoice("paid", 0)).toBe(false);
    expect(canSyncGroomingAppointmentPriceToInvoice("partially_paid", 50)).toBe(false);
    expect(canSyncGroomingAppointmentPriceToInvoice("outstanding", 10)).toBe(false);
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
