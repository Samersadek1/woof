import { format, parseISO } from "date-fns";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import { supabase } from "@/integrations/supabase/client";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { invoiceDisplayTotals, vatLineLabel } from "@/lib/vatConfig";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  subtotal_aed: number | null;
  subtotal: number;
  discount_aed: number | null;
  discount_amount: number;
  total_aed: number | null;
  total: number;
  vat_aed: number | null;
  amount_paid: number;
  payment_method: string | null;
  notes: string | null;
  service_type: string | null;
  owner_id: string;
  booking_id: string | null;
  owners: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    address: string | null;
    email: string | null;
  } | null;
  bookings: {
    booking_ref: string | null;
    check_in_date: string;
    check_out_date: string;
  } | null;
  line_items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    sort_order: number | null;
  }>;
};

type AdjustmentRow = {
  id: string;
  adjustment_type: string;
  reason: string | null;
  adjusted_amount: number | null;
};

type PaymentHistoryRow = {
  id: string;
  created_at: string;
  transaction_type: string;
  payment_method: string | null;
  performed_by: string | null;
  notes: string | null;
  amount: number;
};

async function fetchInvoicePrintable(invoiceId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id, invoice_number, status, issue_date, due_date, subtotal_aed, subtotal,
      discount_aed, discount_amount, total_aed, total, vat_aed, amount_paid, payment_method, notes, service_type, owner_id, booking_id,
      owners(first_name, last_name, phone, address, email),
      bookings(booking_ref, check_in_date, check_out_date),
      line_items:invoice_line_items(id, description, quantity, unit_price, total_price, sort_order)
    `,
    )
    .eq("id", invoiceId)
    .single();

  if (error) throw error;
  const invoice = data as InvoiceRow;

  const [{ data: payments, error: paymentError }, { data: adjustments, error: adjustmentError }] =
    await Promise.all([
      supabase
        .from("wallet_transactions")
        .select("id, created_at, transaction_type, payment_method, performed_by, notes, amount")
        .eq("invoice_id", invoiceId)
        .in("transaction_type", ["cash_payment", "card_payment", "bank_transfer_payment", "deduction"])
        .order("created_at", { ascending: true }),
      supabase
        .from("billing_adjustments")
        .select("id, adjustment_type, reason, adjusted_amount")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true }),
    ]);

  if (paymentError) throw paymentError;
  if (adjustmentError) throw adjustmentError;
  return {
    invoice,
    payments: (payments ?? []) as PaymentHistoryRow[],
    adjustments: (adjustments ?? []) as AdjustmentRow[],
  };
}

function watermark(status: string): { text: string; className: string } | null {
  if (status === "paid") return { text: "PAID", className: "text-slate-300" };
  if (status === "voided" || status === "cancelled") return { text: "VOIDED", className: "text-red-300" };
  return null;
}

export default function InvoicePrintPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["print", "invoice", invoiceId],
    enabled: !!invoiceId,
    queryFn: () => fetchInvoicePrintable(invoiceId!),
  });

  const invoice = data?.invoice;
  const payments = data?.payments ?? [];
  const adjustments = data?.adjustments ?? [];

  const subtotal = invoice ? invoice.subtotal_aed ?? invoice.subtotal : 0;
  const discount = invoice ? invoice.discount_aed ?? invoice.discount_amount ?? 0 : 0;
  const money = invoice
    ? invoiceDisplayTotals({
        total: invoice.total,
        total_aed: invoice.total_aed,
        vat_aed: invoice.vat_aed,
        service_type: invoice.service_type,
        notes: invoice.notes,
      })
    : { netExVat: 0, vat: 0, grandTotal: 0 };
  const netAfterDiscount = money.netExVat;
  const vat = money.vat;
  const grandTotal = money.grandTotal;
  const paidAmount = invoice?.amount_paid ?? 0;
  const outstanding = Math.max(grandTotal - paidAmount, 0);
  const wm = invoice ? watermark(invoice.status) : null;

  return (
    <PrintLayout imageUrls={["/woof-logo.png"]}>
      {isLoading ? <p className="print-sans text-sm">Loading invoice...</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load this invoice.
        </p>
      ) : null}

      {invoice ? (
        <article className="print-page relative border border-black p-4 text-[12px]">
          {wm ? (
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold opacity-30 ${wm.className}`}
              style={{ transform: "rotate(-32deg)" }}
            >
              {wm.text}
            </div>
          ) : null}

          <header className="relative z-[1] mb-4 border-b border-black pb-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <img
                  src="/woof-logo.png"
                  alt="woof"
                  className="h-14 w-14 shrink-0 print-keep-color"
                />
                <div>
                  <p className="print-label text-xl font-bold">WOOF PETS SERVICES LLC</p>
                  <p className="print-sans text-xs">
                    Dubai · TRN: 104486686900003 · +971 00 000 0000
                  </p>
                  <p className="print-sans text-xs">hello@woof.ae</p>
                </div>
              </div>
              <div className="print-sans text-right text-xs">
                <p>Invoice: {invoice.invoice_number ?? invoice.id.slice(0, 8)}</p>
                <p>Date: {format(parseISO(invoice.issue_date), "d MMM yyyy")}</p>
                <p>Due: {invoice.due_date ? format(parseISO(invoice.due_date), "d MMM yyyy") : "—"}</p>
              </div>
            </div>
          </header>

          <section className="relative z-[1] mb-4 border border-black p-2">
            <p className="print-label text-[11px] font-semibold uppercase">Bill To</p>
            <p>{ownerDisplayName(invoice.owners?.first_name, invoice.owners?.last_name)}</p>
            <p>{invoice.owners?.phone ?? "—"}</p>
            <p>{invoice.owners?.address ?? "Address not provided"}</p>
          </section>

          {invoice.bookings ? (
            <section className="relative z-[1] mb-4 border border-black p-2 print-sans text-[11px]">
              <p className="print-label mb-1 font-semibold uppercase">Stay</p>
              {invoice.bookings.booking_ref ? (
                <p>Booking: {invoice.bookings.booking_ref}</p>
              ) : null}
              <p>
                {format(parseISO(invoice.bookings.check_in_date), "d MMM yyyy")} →{" "}
                {format(parseISO(invoice.bookings.check_out_date), "d MMM yyyy")}
              </p>
            </section>
          ) : null}

          <section className="relative z-[1] mb-4">
            <table className="w-full border-collapse border border-black">
              <thead className="print-sans text-[11px]">
                <tr>
                  <th className="border border-black px-2 py-1 text-left">Description</th>
                  <th className="border border-black px-2 py-1 text-right">Qty</th>
                  <th className="border border-black px-2 py-1 text-right">Unit Price</th>
                  <th className="border border-black px-2 py-1 text-right">Discount</th>
                  <th className="border border-black px-2 py-1 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((line) => {
                    const lineBase = line.unit_price * line.quantity;
                    const lineDiscount = subtotal > 0 ? (discount * lineBase) / subtotal : 0;
                    const lineTotal = lineBase - lineDiscount;
                    return (
                      <tr key={line.id}>
                        <td className="border border-black px-2 py-1">{line.description}</td>
                        <td className="border border-black px-2 py-1 text-right">{line.quantity}</td>
                        <td className="border border-black px-2 py-1 text-right">AED {line.unit_price.toFixed(2)}</td>
                        <td className="border border-black px-2 py-1 text-right">AED {lineDiscount.toFixed(2)}</td>
                        <td className="border border-black px-2 py-1 text-right">AED {lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>

          {adjustments.length > 0 ? (
            <section className="relative z-[1] mb-4">
              <p className="print-label mb-1 text-[11px] font-semibold uppercase">Adjustments</p>
              <table className="w-full border-collapse border border-black print-sans text-[11px]">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 text-left">Type</th>
                    <th className="border border-black px-2 py-1 text-left">Reason</th>
                    <th className="border border-black px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adjustment) => (
                    <tr key={adjustment.id}>
                      <td className="border border-black px-2 py-1 capitalize">
                        {adjustment.adjustment_type.replace(/_/g, " ")}
                      </td>
                      <td className="border border-black px-2 py-1">{adjustment.reason ?? "—"}</td>
                      <td className="border border-black px-2 py-1 text-right">
                        AED {Math.abs(adjustment.adjusted_amount ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="relative z-[1] mb-4 flex justify-end">
            <div className="w-[220px] space-y-1 print-sans text-xs">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>AED {subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 ? (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>- AED {discount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Subtotal (ex VAT)</span>
                <span>AED {netAfterDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{vatLineLabel()}</span>
                <span>AED {vat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-black pt-1 text-sm font-bold">
                <span>Grand total</span>
                <span>AED {grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount paid</span>
                <span>AED {paidAmount.toFixed(2)}</span>
              </div>
              {["outstanding", "overdue", "issued", "finalised", "draft"].includes(invoice.status) ? (
                <div className="flex justify-between font-semibold">
                  <span>Balance outstanding</span>
                  <span>AED {outstanding.toFixed(2)}</span>
                </div>
              ) : null}
            </div>
          </section>

          {payments.length > 0 ? (
            <section className="relative z-[1] mb-4">
              <p className="print-label mb-1 text-[11px] font-semibold uppercase">Payment History</p>
              <table className="w-full border-collapse border border-black print-sans text-[11px]">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 text-left">Date</th>
                    <th className="border border-black px-2 py-1 text-left">Method</th>
                    <th className="border border-black px-2 py-1 text-right">Amount</th>
                    <th className="border border-black px-2 py-1 text-left">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="border border-black px-2 py-1">
                        {format(parseISO(payment.created_at), "d MMM yyyy")}
                      </td>
                      <td className="border border-black px-2 py-1">
                        {(payment.payment_method ?? payment.transaction_type).replace(/_/g, " ")}
                      </td>
                      <td className="border border-black px-2 py-1 text-right">
                        AED {Math.abs(payment.amount).toFixed(2)}
                      </td>
                      <td className="border border-black px-2 py-1">
                        {payment.performed_by ?? payment.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {invoice.notes?.trim() ? (
            <section className="relative z-[1] mb-4 border border-black p-2 print-sans text-[11px]">
              <p className="print-label mb-1 font-semibold uppercase">Notes</p>
              <p className="whitespace-pre-line">{invoice.notes}</p>
            </section>
          ) : null}

          <footer className="relative z-[1] border-t border-black pt-2 print-sans text-[11px]">
            <p>Thank you for choosing woof.</p>
            {outstanding > 0 ? <p>Payment terms: payable upon receipt.</p> : null}
            <p>TRN: 104486686900003 · www.woof.ae</p>
          </footer>
        </article>
      ) : null}
    </PrintLayout>
  );
}
