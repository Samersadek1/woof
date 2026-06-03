/** Build wa.me link for overdue invoice reminder (digits-only phone, URL-encoded text). */

export function digitsOnlyPhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function buildOverdueInvoiceWhatsAppUrl(options: {
  phone: string | null | undefined;
  ownerName: string;
  invoiceNumberDisplay: string;
  amountAed: number;
}): string | null {
  const digits = digitsOnlyPhone(options.phone);
  if (!digits) return null;
  const inv = options.invoiceNumberDisplay.trim() || "—";
  const name = options.ownerName.trim() || "Client";
  const amt = options.amountAed.toFixed(3);
  const message =
    `Dear ${name}, this is a friendly reminder that invoice ${inv} for AED ${amt} is overdue. Please contact us to arrange payment. Thank you, woof Team.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildAccountReminderWhatsAppUrl(options: {
  phone: string | null | undefined;
  ownerName: string;
  totalDueAed: number;
}): string | null {
  const digits = digitsOnlyPhone(options.phone);
  if (!digits) return null;
  const name = options.ownerName.trim() || "Client";
  const amt = options.totalDueAed.toFixed(3);
  const message =
    `Dear ${name}, this is a friendly reminder that your account has an outstanding balance of AED ${amt}. Please contact us to arrange payment. Thank you, woof Team.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
