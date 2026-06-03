/**
 * Backfill Ally Lee boarding history + CC invoice for MSH receipt #91775.
 * Wallet credit (AED 12.90) came from CC overpayment on this stay.
 *
 * Usage:
 *   node scripts/ingest-ally-lee-boarding-91775.mjs
 *   node scripts/ingest-ally-lee-boarding-91775.mjs --dry-run
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

const OWNER_ID = "19920922-76a1-4aef-9d63-447b406af653";
const PET_LUCY = "5a4f589e-a148-4108-a4a5-f0287c6a7d03";
const PET_BROOKE = "6638ea7d-96f4-4390-95b4-1d2b5d70a91f";
const INGEST_KEY = "LEGACY:MSH-BROOKE-MAR21";
const SOURCE_EXTERNAL_ID = "LEGACY:MSH-91775-BOARDING";
const INVOICE_NUMBER = "MSH-BROOKE-91775-BOARDING";
const RECEIPT = "91775";

const CHECK_IN = "2026-03-19";
const CHECK_OUT = "2026-03-21";
const PAID_AT = "2026-03-21T14:00:00+04:00";

const BOARDING_SUBTOTAL = 765;
const BOARDING_DISCOUNT = 114.75;
const BOARDING_TOTAL = 650.25;
const CC_PAID = 663.15;
const WALLET_CREDIT = 12.9;

const VAT_RATE = 0.05;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

async function findExistingBooking() {
  const { data, error } = await sb
    .from("bookings")
    .select("id, booking_ref")
    .eq("owner_id", OWNER_ID)
    .eq("source_external_id", SOURCE_EXTERNAL_ID)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function ensureBooking() {
  const existing = await findExistingBooking();
  if (existing) {
    console.log(`Booking exists: ${existing.booking_ref} (${existing.id})`);
    return existing.id;
  }

  const { data: refData, error: refErr } = await sb.rpc("generate_booking_ref");
  if (refErr) throw refErr;
  const bookingRef = refData;

  const payload = {
    owner_id: OWNER_ID,
    booking_ref: bookingRef,
    booking_type: "boarding",
    check_in_date: CHECK_IN,
    check_out_date: CHECK_OUT,
    status: "checked_out",
    actual_check_in_at: `${CHECK_IN}T10:00:00+04:00`,
    actual_check_out_at: `${CHECK_OUT}T11:00:00+04:00`,
    notes: `Legacy MSH receipt #${RECEIPT}. Boarding Mar 19–21 (Lucy & Brooke). Paid CC AED ${CC_PAID}; AED ${WALLET_CREDIT} credited to wallet. ${INGEST_KEY}`,
    source_external_id: SOURCE_EXTERNAL_ID,
    created_by: "legacy-ingest",
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] booking ${bookingRef} ${CHECK_IN} → ${CHECK_OUT}`);
    return "dry-run-booking-id";
  }

  const { data: booking, error: bookingErr } = await sb
    .from("bookings")
    .insert(payload)
    .select("id, booking_ref")
    .single();
  if (bookingErr) throw bookingErr;

  const { error: petsErr } = await sb.from("booking_pets").insert([
    { booking_id: booking.id, pet_id: PET_LUCY },
    { booking_id: booking.id, pet_id: PET_BROOKE },
  ]);
  if (petsErr) throw petsErr;

  console.log(`Created booking ${booking.booking_ref} (${booking.id})`);
  return booking.id;
}

async function ensureInvoice(bookingId) {
  const { data: existing, error: findErr } = await sb
    .from("invoices")
    .select("id")
    .eq("owner_id", OWNER_ID)
    .eq("invoice_number", INVOICE_NUMBER)
    .limit(1);
  if (findErr) throw findErr;
  if (existing?.[0]) {
    console.log(`Invoice exists: ${INVOICE_NUMBER} (${existing[0].id})`);
    return existing[0].id;
  }

  const notes = `Legacy MSH receipt #${RECEIPT}. Boarding March 19–21 — Lucy & Brooke (Peak). Paid CC AED ${CC_PAID}; AED ${WALLET_CREDIT} overpayment → wallet. ${INGEST_KEY}`;

  if (DRY_RUN) {
    console.log(`  [dry-run] invoice ${INVOICE_NUMBER} boarding AED ${BOARDING_TOTAL}`);
    return "dry-run-invoice-id";
  }

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .insert({
      owner_id: OWNER_ID,
      booking_id: bookingId,
      invoice_number: INVOICE_NUMBER,
      service_type: "boarding",
      issue_date: CHECK_OUT,
      status: "paid",
      payment_method: "card",
      subtotal: BOARDING_SUBTOTAL,
      discount_amount: BOARDING_DISCOUNT,
      discount_pct: 0,
      total: BOARDING_TOTAL,
      amount_paid: BOARDING_TOTAL,
      vat_aed: vatFromGross(BOARDING_TOTAL),
      paid_at: PAID_AT,
      notes,
      created_at: PAID_AT,
      updated_at: PAID_AT,
    })
    .select("id")
    .single();
  if (invErr) throw invErr;

  const { error: liErr } = await sb.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: "Boarding March 19–21 — Lucy & Brooke (Peak)",
    quantity: 2,
    unit_price: 382.5,
    total_price: BOARDING_SUBTOTAL,
    line_total: BOARDING_TOTAL,
    pricing_key: "boarding_night",
    service_type: "boarding",
    sort_order: 0,
    created_at: PAID_AT,
  });
  if (liErr) throw liErr;

  console.log(`Created invoice ${INVOICE_NUMBER} (${inv.id})`);
  return inv.id;
}

async function linkWalletCredit(invoiceId) {
  const { data: txs, error: txErr } = await sb
    .from("wallet_transactions")
    .select("id, notes")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%${INGEST_KEY}%`)
    .eq("transaction_type", "top_up")
    .limit(1);
  if (txErr) throw txErr;

  const tx = txs?.[0];
  if (!tx) {
    console.warn("Wallet credit tx not found — skipping link");
    return;
  }

  const notes = `Wallet credit AED ${WALLET_CREDIT.toFixed(2)} from CC overpayment on receipt #${RECEIPT} (boarding paid AED ${CC_PAID}, invoice AED ${BOARDING_TOTAL}). ${INGEST_KEY}`;

  if (DRY_RUN) {
    console.log(`  [dry-run] update wallet tx ${tx.id} → link invoice ${invoiceId}`);
    return;
  }

  const { error: updErr } = await sb
    .from("wallet_transactions")
    .update({
      invoice_id: invoiceId,
      payment_method: "card",
      notes,
    })
    .eq("id", tx.id);
  if (updErr) throw updErr;
  console.log("Linked wallet credit to boarding invoice");
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — writing to Supabase");
  const bookingId = await ensureBooking();
  const invoiceId = await ensureInvoice(bookingId);
  await linkWalletCredit(invoiceId);
  console.log("Done Ally Lee boarding backfill.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
