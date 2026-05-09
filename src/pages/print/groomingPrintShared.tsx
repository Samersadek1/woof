import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { labelForGroomingService, type GroomingService } from "@/lib/groomingCatalog";
import { ownerDisplayName } from "@/lib/bookingUtils";
import {
  grandTotalFromNet,
  invoiceDisplayTotals,
  vatAmountFromNet,
  vatLineLabel,
} from "@/lib/vatConfig";

export type GroomingInvoiceMoney = {
  netExVat: number;
  vat: number;
  grandTotal: number;
};

function groomingMoneyFromPrice(price: number): GroomingInvoiceMoney {
  const netExVat = Math.max(0, price);
  return {
    netExVat,
    vat: vatAmountFromNet(netExVat),
    grandTotal: grandTotalFromNet(netExVat),
  };
}

export type GroomingPrintRow = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  service: GroomingService;
  grooming_notes: string | null;
  notes: string | null;
  pet_id: string;
  owner_id: string;
  price: number | null;
  booking_id: string | null;
  owners: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
  } | null;
  pets: {
    name: string;
    breed: string | null;
    size_category: "S" | "M" | "L" | "XL" | null;
    grooming_notes: string | null;
    medical_conditions: string | null;
  } | null;
  bookings: {
    booking_ref: string | null;
  } | null;
};

const PACKAGE_LABEL: Partial<Record<GroomingService, string>> = {
  full_groom: "Grande - Full Groom",
  full_bath: "Bijoux - Full Bath",
  deshedding: "Deshedding",
  brushing: "Brushing",
  nail_clip: "Nail Clip",
  pawdicure: "Pawdicure",
};

export function formatAppointmentTime(time: string | null): string {
  if (!time) return "—";
  const normalized = time.length >= 5 ? time.slice(0, 5) : time;
  try {
    return format(parseISO(`2000-01-01T${normalized}`), "h:mm a");
  } catch {
    return normalized;
  }
}

type PreviousGroomMap = Record<string, string | null>;
type AmountMap = Record<string, GroomingInvoiceMoney | null>;

export async function fetchGroomingRowsForDate(
  date: string,
): Promise<{
  appointments: GroomingPrintRow[];
  previousByPetId: PreviousGroomMap;
  amountByAppointmentId: AmountMap;
}> {
  const { data, error } = await supabase
    .from("grooming_appointments")
    .select(
      `
      id, appointment_date, appointment_time, service, grooming_notes, notes, pet_id, owner_id, price, booking_id,
      owners(first_name, last_name, phone),
      pets(name, breed, size_category, grooming_notes, medical_conditions),
      bookings(booking_ref)
    `,
    )
    .eq("appointment_date", date)
    .neq("status", "cancelled")
    .order("appointment_time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  const appointments = (data ?? []) as GroomingPrintRow[];
  return enrichGroomingRows(appointments);
}

export async function fetchGroomingRowById(
  bookingId: string,
): Promise<{
  appointment: GroomingPrintRow;
  previousGroomDate: string | null;
  invoiceMoney: GroomingInvoiceMoney | null;
}> {
  const { data, error } = await supabase
    .from("grooming_appointments")
    .select(
      `
      id, appointment_date, appointment_time, service, grooming_notes, notes, pet_id, owner_id, price, booking_id,
      owners(first_name, last_name, phone),
      pets(name, breed, size_category, grooming_notes, medical_conditions),
      bookings(booking_ref)
    `,
    )
    .eq("id", bookingId)
    .single();

  if (error) throw error;
  const row = data as GroomingPrintRow;

  const enriched = await enrichGroomingRows([row]);
  return {
    appointment: row,
    previousGroomDate: enriched.previousByPetId[row.pet_id] ?? null,
    invoiceMoney:
      enriched.amountByAppointmentId[row.id] ??
      (row.price != null ? groomingMoneyFromPrice(row.price) : null),
  };
}

async function enrichGroomingRows(rows: GroomingPrintRow[]): Promise<{
  appointments: GroomingPrintRow[];
  previousByPetId: PreviousGroomMap;
  amountByAppointmentId: AmountMap;
}> {
  if (rows.length === 0) {
    return { appointments: [], previousByPetId: {}, amountByAppointmentId: {} };
  }

  const minDate = rows.reduce((min, r) => (r.appointment_date < min ? r.appointment_date : min), rows[0].appointment_date);
  const petIds = Array.from(new Set(rows.map((r) => r.pet_id)));
  const appointmentIds = rows.map((r) => r.id);

  const [{ data: previousRows, error: previousError }, { data: invoices, error: invoicesError }] =
    await Promise.all([
      supabase
        .from("grooming_appointments")
        .select("pet_id, appointment_date, status")
        .in("pet_id", petIds)
        .lt("appointment_date", minDate)
        .neq("status", "cancelled")
        .order("appointment_date", { ascending: false }),
      supabase
        .from("invoices")
        .select("service_id, total_aed, total, vat_aed")
        .eq("service_type", "grooming")
        .in("service_id", appointmentIds),
    ]);

  if (previousError) throw previousError;
  if (invoicesError) throw invoicesError;

  const previousByPetId: PreviousGroomMap = {};
  for (const row of previousRows ?? []) {
    if (!previousByPetId[row.pet_id]) previousByPetId[row.pet_id] = row.appointment_date;
  }

  const amountByAppointmentId: AmountMap = {};
  for (const inv of invoices ?? []) {
    if (!inv.service_id) continue;
    amountByAppointmentId[inv.service_id] = invoiceDisplayTotals({
      total: inv.total,
      total_aed: inv.total_aed,
      vat_aed: inv.vat_aed,
    });
  }

  return {
    appointments: rows,
    previousByPetId,
    amountByAppointmentId,
  };
}

export function GroomingCardBlock({
  appointment,
  previousGroomDate,
  invoiceMoney,
}: {
  appointment: GroomingPrintRow;
  previousGroomDate: string | null;
  invoiceMoney: GroomingInvoiceMoney | null;
}) {
  const owner = ownerDisplayName(appointment.owners?.first_name, appointment.owners?.last_name);
  const serviceLabel = labelForGroomingService(appointment.service);
  const packageLabel = PACKAGE_LABEL[appointment.service] ?? serviceLabel;
  const money = invoiceMoney ?? groomingMoneyFromPrice(appointment.price ?? 0);

  return (
    <article className="print-page border border-black p-4 text-[12px]">
      <header className="mb-3 border-b border-black pb-2">
        <h1 className="text-2xl font-bold">{appointment.pets?.name ?? "Unknown pet"}</h1>
        <p>
          {appointment.pets?.breed ?? "Unknown breed"} · {appointment.pets?.size_category ?? "—"}
        </p>
        <p className="print-sans text-xs">
          {format(parseISO(appointment.appointment_date), "d MMM yyyy")} ·{" "}
          {formatAppointmentTime(appointment.appointment_time)}
        </p>
        <p className="print-sans text-sm font-semibold">
          {packageLabel}
          {packageLabel !== serviceLabel ? ` (${serviceLabel})` : ""}
        </p>
        <p className="print-sans text-xs">Assigned groomer: {appointment.grooming_notes ?? "—"}</p>
      </header>

      <div className="space-y-2">
        <p>
          <span className="print-label font-semibold uppercase text-[11px]">Owner: </span>
          {owner} · {appointment.owners?.phone ?? "—"}
        </p>
        <p>
          <span className="print-label font-semibold uppercase text-[11px]">Coat notes: </span>
          {appointment.pets?.grooming_notes ?? "—"}
        </p>
        <p>
          <span className="print-label font-semibold uppercase text-[11px]">Sensitivities: </span>
          {appointment.pets?.medical_conditions ?? "—"}
        </p>
        <p>
          <span className="print-label font-semibold uppercase text-[11px]">Previous groom: </span>
          {previousGroomDate ? format(parseISO(previousGroomDate), "d MMM yyyy") : "—"}
        </p>
        <p className="whitespace-pre-line">
          <span className="print-label font-semibold uppercase text-[11px]">Special requests: </span>
          {appointment.notes ?? "—"}
        </p>
      </div>

      <section className="mt-3 border border-black p-2">
        <p className="print-label mb-2 text-[11px] font-semibold uppercase">Checklist</p>
        <div className="grid grid-cols-2 gap-y-1">
          {[
            "Bath",
            "Blow dry",
            "Cut/trim",
            "Nails clipped",
            "Ears cleaned",
            "Teeth brushed",
            "Before photo taken",
            "After photo taken",
          ].map((item) => (
            <p key={item} className="print-sans text-xs">
              ☐ {item}
            </p>
          ))}
        </div>
      </section>

      <footer className="mt-3 border-t border-black pt-2 print-sans text-xs space-y-0.5">
        <p>Booking ref: {appointment.bookings?.booking_ref ?? appointment.booking_id ?? appointment.id.slice(0, 8)}</p>
        <p>Subtotal (ex VAT): AED {money.netExVat.toFixed(2)}</p>
        <p>
          {vatLineLabel()}: AED {money.vat.toFixed(2)}
        </p>
        <p className="font-semibold">Total incl. VAT: AED {money.grandTotal.toFixed(2)}</p>
      </footer>
    </article>
  );
}
