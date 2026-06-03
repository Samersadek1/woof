/**
 * Idempotent legacy ingest for Lucy Nash / CL001121 (pets Remi & Rumour).
 * Source: Tax Invoice remi rumour nash April 20 2026 CREDIT from MSH.xlsx
 *
 * Usage: node scripts/ingest-lucy-nash-credit.mjs
 *        node scripts/ingest-lucy-nash-credit.mjs --dry-run
 */
import XLSX from "xlsx";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH =
  "/Users/nawalhilal/Downloads/Tax Invoice remi rumour nash April 20 2026 CREDIT from MSH.xlsx";

const OWNER_ID = "9b732637-0bbe-444e-9302-0e5bb0b9cc52";
const PET_REMI = "b2ce0dc5-a197-431c-aaf5-676948198e1e";
const PET_RUMOUR = "0ad9dd87-0e41-4261-943d-c68138e07480";
const INGEST_KEY = "LEGACY:MSH-NASH-APR20";
const HOURLY_UNIT_RATE = 10.5;
const VAT_RATE = 0.05;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseSessionDate(label) {
  const m = label.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i,
  );
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  return `2026-${String(month).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function parseTimeToken(token) {
  const m = token.trim().match(/^(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = (m[3] ?? "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function parseSessionTimes(description) {
  const dcare = description.match(/Dcare\s+(.+)$/i);
  if (!dcare) return { checkIn: null, checkOut: null };
  const chunk = dcare[1].trim();
  if (!chunk || chunk.endsWith("-")) return { checkIn: null, checkOut: null };
  const parts = chunk.split("-");
  if (parts.length === 1) {
    return { checkIn: parseTimeToken(parts[0]), checkOut: null };
  }
  return { checkIn: parseTimeToken(parts[0]), checkOut: parseTimeToken(parts[1]) };
}

function petsForLine({ service, qty }) {
  if (/remi/i.test(service) && !/rumour/i.test(service)) return [PET_REMI];
  if (/rumour/i.test(service) && !/remi/i.test(service)) return [PET_RUMOUR];
  if (qty >= 2) return [PET_REMI, PET_RUMOUR];
  return [PET_REMI];
}

function loadCreditLines() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Credit details"], { header: 1, defval: "" });
  const lines = [];
  for (const row of rows.slice(13)) {
    const qtyRaw = row[0];
    const service = String(row[1] ?? "").trim();
    const totalRaw = row[10];
    const unitRaw = row[5];
    const discountRaw = row[8];
    const qty = typeof qtyRaw === "number" ? qtyRaw : parseInt(String(qtyRaw), 10) || 1;
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : parseFloat(String(totalRaw).replace(/[^0-9.-]/g, ""));
    const unit =
      typeof unitRaw === "number"
        ? unitRaw
        : parseFloat(String(unitRaw).replace(/[^0-9.-]/g, ""));
    const discount =
      typeof discountRaw === "number"
        ? discountRaw
        : parseFloat(String(discountRaw).replace(/[^0-9.-]/g, ""));

    let amount = 0;
    if (Number.isFinite(total) && total !== 0) amount = Math.abs(total);
    else if (Number.isFinite(unit) && unit > 0) amount = unit;
    else if (Number.isFinite(discount) && discount > 0) amount = discount;

    if (!service || service === "Deposit Paid" || service.startsWith("Total")) break;
    lines.push({ service, qty, amount });
  }
  return lines;
}

async function getOwnerBalance() {
  const { data, error } = await sb.from("owners").select("wallet_balance").eq("id", OWNER_ID).single();
  if (error) throw error;
  return round2(data.wallet_balance ?? 0);
}

async function setOwnerBalance(balance) {
  if (DRY_RUN) return;
  const { error } = await sb.from("owners").update({ wallet_balance: round2(balance) }).eq("id", OWNER_ID);
  if (error) throw error;
}

async function insertWalletTx({ type, amount, balanceAfter, notes, invoiceId, createdAt }) {
  if (DRY_RUN) {
    console.log(`  [dry-run] wallet ${type} ${amount} -> balance ${balanceAfter}`);
    return null;
  }
  const { data, error } = await sb
    .from("wallet_transactions")
    .insert({
      owner_id: OWNER_ID,
      transaction_type: type,
      amount: round2(amount),
      balance_after: round2(balanceAfter),
      notes,
      invoice_id: invoiceId ?? null,
      payment_method: type === "top_up" ? "cash" : "wallet",
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function findExistingTx(notesFragment) {
  const { data, error } = await sb
    .from("wallet_transactions")
    .select("id, notes, amount, balance_after, created_at")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%${notesFragment}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findExistingInvoice(invoiceNumber) {
  const { data, error } = await sb
    .from("invoices")
    .select("id, invoice_number, total, status")
    .eq("owner_id", OWNER_ID)
    .eq("invoice_number", invoiceNumber)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findExistingDaycareSession(sessionDate, petId, marker) {
  const { data, error } = await sb
    .from("daycare_sessions")
    .select("id, notes")
    .eq("owner_id", OWNER_ID)
    .eq("pet_id", petId)
    .eq("session_date", sessionDate)
    .ilike("notes", `%${marker}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function createInvoice({
  invoiceNumber,
  serviceType,
  referenceId,
  grossTotal,
  issueDate,
  paidAt,
  notes,
  lineDescription,
  quantity,
  unitPrice,
  pricingKey,
}) {
  const vatAed = vatFromGross(grossTotal);
  const payload = {
    owner_id: OWNER_ID,
    invoice_number: invoiceNumber,
    service_type: serviceType,
    service_id: referenceId,
    booking_id: null,
    status: "paid",
    payment_method: "wallet",
    issue_date: issueDate,
    paid_at: paidAt,
    amount_paid: grossTotal,
    subtotal: grossTotal,
    discount_pct: 0,
    discount_amount: 0,
    total: grossTotal,
    vat_aed: vatAed,
    notes,
    created_at: paidAt,
    updated_at: paidAt,
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] invoice ${invoiceNumber ?? "(auto)"} ${serviceType} AED ${grossTotal}`);
    return "dry-run-invoice-id";
  }

  const { data: inv, error: invErr } = await sb.from("invoices").insert(payload).select("id").single();
  if (invErr) throw invErr;

  const { error: liErr } = await sb.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: lineDescription,
    quantity,
    unit_price: unitPrice,
    total_price: grossTotal,
    line_total: grossTotal,
    pricing_key: pricingKey ?? null,
    service_type: serviceType,
    sort_order: 0,
    created_at: paidAt,
  });
  if (liErr) throw liErr;
  return inv.id;
}

async function ensureDaycareSession({ sessionDate, description, petId, invoiceId }) {
  const marker = `${INGEST_KEY}:${description}`;
  const existing = await findExistingDaycareSession(sessionDate, petId, marker);
  if (existing) return existing.id;

  const { checkIn, checkOut } = parseSessionTimes(description);
  const checkInAt = checkIn ? `${sessionDate}T${checkIn}+04:00` : `${sessionDate}T08:30:00+04:00`;
  const checkOutAt = checkOut ? `${sessionDate}T${checkOut}+04:00` : null;
  const notes = [`${marker}`, "BILLING_PATH:hourly", invoiceId ? `HOURLY_INVOICED:${invoiceId}` : null]
    .filter(Boolean)
    .join("\n");

  if (DRY_RUN) {
    console.log(`  [dry-run] daycare session ${sessionDate} pet=${petId.slice(0, 8)} ${description}`);
    return `dry-run-session-${petId.slice(0, 8)}`;
  }

  const { data, error } = await sb
    .from("daycare_sessions")
    .insert({
      owner_id: OWNER_ID,
      pet_id: petId,
      session_date: sessionDate,
      checked_in: true,
      checked_in_at: checkInAt,
      checked_out_at: checkOutAt,
      notes,
      created_at: checkInAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function markSessionInvoiced(sessionId, invoiceId) {
  if (DRY_RUN || sessionId.startsWith("dry-run")) return;
  const { data, error } = await sb.from("daycare_sessions").select("notes").eq("id", sessionId).single();
  if (error) throw error;
  const base = (data.notes ?? "").split("\n").filter(Boolean);
  if (!base.some((line) => line.startsWith("HOURLY_INVOICED:"))) {
    base.push(`HOURLY_INVOICED:${invoiceId}`);
  }
  await sb.from("daycare_sessions").update({ notes: base.join("\n") }).eq("id", sessionId);
}

function invoiceSlug(service) {
  return service.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — writing to Supabase");
  const lines = loadCreditLines();
  console.log(`Loaded ${lines.length} credit-detail lines`);

  if (await findExistingTx(INGEST_KEY)) {
    console.log(`Resuming ingest (${INGEST_KEY} already present).`);
  }

  let balance = await getOwnerBalance();
  console.log(`Starting wallet balance: AED ${balance}`);

  for (const line of lines) {
    const { service, qty, amount } = line;
    const sessionDate = parseSessionDate(service);
    const tsBase = sessionDate ? `${sessionDate}T12:00:00+04:00` : "2026-04-20T10:00:00+04:00";

    if (/credit from my second home/i.test(service)) {
      if (await findExistingTx("Credit from My Second home")) {
        console.log("Skip MSH credit top-up (already recorded)");
        continue;
      }
      balance = round2(balance + amount);
      await insertWalletTx({
        type: "top_up",
        amount,
        balanceAfter: balance,
        notes: `Credit from My Second home (Apr 20 2026). ${INGEST_KEY}`,
        createdAt: "2026-04-20T10:00:00+04:00",
      });
      console.log(`MSH credit top-up AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/assessment/i.test(service)) {
      console.log(`${service} (no charge) — skipped (free assessment, no session)`);
      continue;
    }

    if (/sspl/i.test(service)) {
      const invoiceNumber = `MSH-NASH-SSPL-${sessionDate}`;
      let invoiceId = (await findExistingInvoice(invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice({
          invoiceNumber,
          serviceType: "grooming",
          referenceId: null,
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: `${sessionDate}T15:00:00+04:00`,
          notes: `${service}. ${INGEST_KEY}`,
          lineDescription: service,
          quantity: qty,
          unitPrice: round2(amount / qty),
          pricingKey: null,
        });
      }
      if (!(await findExistingTx(`Paid ${service} from wallet`))) {
        balance = round2(balance - amount);
        await insertWalletTx({
          type: "deduction",
          amount: -amount,
          balanceAfter: balance,
          notes: `Paid ${service} from wallet. ${INGEST_KEY}`,
          invoiceId,
          createdAt: `${sessionDate}T15:01:00+04:00`,
        });
      }
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/nails/i.test(service)) {
      const invoiceNumber = `MSH-NASH-NAILS-${sessionDate}`;
      let invoiceId = (await findExistingInvoice(invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice({
          invoiceNumber,
          serviceType: "grooming",
          referenceId: null,
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: `${sessionDate}T14:00:00+04:00`,
          notes: `${service}. ${INGEST_KEY}`,
          lineDescription: service,
          quantity: 1,
          unitPrice: amount,
          pricingKey: null,
        });
      }
      if (!(await findExistingTx(`Paid ${service} from wallet`))) {
        balance = round2(balance - amount);
        await insertWalletTx({
          type: "deduction",
          amount: -amount,
          balanceAfter: balance,
          notes: `Paid ${service} from wallet. ${INGEST_KEY}`,
          invoiceId,
          createdAt: `${sessionDate}T14:01:00+04:00`,
        });
      }
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/dcare/i.test(service)) {
      const petIds = petsForLine(line);
      const marker = `${INGEST_KEY}:${service}`;

      if (amount <= 0) {
        for (const petId of petIds) {
          await ensureDaycareSession({ sessionDate, description: service, petId, invoiceId: null });
        }
        console.log(`${service} (no charge) — session only`);
        continue;
      }

      const hours = round2(amount / HOURLY_UNIT_RATE);
      const invoiceNumber = `MSH-NASH-DC-${invoiceSlug(service)}`;
      const sessionIds = [];
      for (const petId of petIds) {
        let sessionId = (await findExistingDaycareSession(sessionDate, petId, marker))?.id;
        if (!sessionId) {
          sessionId = await ensureDaycareSession({ sessionDate, description: service, petId, invoiceId: null });
        }
        sessionIds.push(sessionId);
      }

      let invoiceId = (await findExistingInvoice(invoiceNumber))?.id;
      if (!invoiceId) {
        const { data: byNotes } = await sb
          .from("invoices")
          .select("id")
          .eq("owner_id", OWNER_ID)
          .ilike("notes", `%${marker}%`)
          .limit(1);
        invoiceId = byNotes?.[0]?.id;
      }
      if (!invoiceId) {
        invoiceId = await createInvoice({
          invoiceNumber,
          serviceType: "daycare",
          referenceId: sessionIds[0],
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: tsBase,
          notes: `${marker}. ${service}`,
          lineDescription: `Daycare hourly — Remi & Rumour (${hours} hr @ AED ${HOURLY_UNIT_RATE}/hr, 20% discount)`,
          quantity: qty,
          unitPrice: round2(amount / qty),
          pricingKey: "daycare_hourly_single_day",
        });
      }
      for (const sessionId of sessionIds) {
        await markSessionInvoiced(sessionId, invoiceId);
      }

      if (!(await findExistingTx(`Paid ${service} from wallet`))) {
        balance = round2(balance - amount);
        await insertWalletTx({
          type: "deduction",
          amount: -amount,
          balanceAfter: balance,
          notes: `Paid ${service} from wallet. ${INGEST_KEY}`,
          invoiceId,
          createdAt: `${sessionDate}T12:01:00+04:00`,
        });
      }
      console.log(`${service} AED ${amount} (${hours} hr) -> balance ${balance}`);
      continue;
    }

    console.warn(`Skipped unrecognized line: ${service}`);
  }

  await setOwnerBalance(balance);
  console.log(`Done. Final wallet balance: AED ${balance} (expected 1647.89)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
