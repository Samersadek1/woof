/**
 * Idempotent legacy ingest for Raja Dadlani / CL000717 (Roshni Dadlani account, pet Raja).
 * Source: 92834 Tax Invoice raja dadlani May 1 2026 paid TT credit pending.xlsx
 *
 * Usage: node scripts/ingest-raja-dadlani-92834.mjs
 *        node scripts/ingest-raja-dadlani-92834.mjs --dry-run
 */
import XLSX from "xlsx";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH =
  "/Users/nawalhilal/Downloads/92834 Tax Invoice raja dadlani May 1 2026 paid TT credit pending.xlsx";

const OWNER_ID = "8a4b428d-b0c2-4b64-88d4-41c447d3f9e9";
const PET_ID = "d1878c46-a6b1-4f72-a190-89b02d9f223b";
const INGEST_KEY = "LEGACY:92834";
const HOURLY_UNIT_RATE = 10.5;
const VAT_RATE = 0.05;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

function parseMayDate(label) {
  const m = label.match(/^May\s+(\d{1,2})\b/i);
  if (!m) return null;
  return `2026-05-${String(m[1]).padStart(2, "0")}`;
}

function parseTimeToken(token) {
  const m = token.trim().match(/^(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = (m[3] ?? "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour <= 7) hour += 12; // bare morning times like 8.30
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function parseSessionTimes(description) {
  const dcare = description.match(/Dcare\s+(.+)$/i);
  if (!dcare) return { checkIn: null, checkOut: null };
  const chunk = dcare[1].trim();
  const parts = chunk.split("-");
  if (parts.length === 1) {
    return { checkIn: parseTimeToken(parts[0]), checkOut: null };
  }
  return { checkIn: parseTimeToken(parts[0]), checkOut: parseTimeToken(parts[1]) };
}

function loadCreditLines() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Credit details"], { header: 1, defval: "" });
  const lines = [];
  for (const row of rows.slice(13)) {
    const service = String(row[1] ?? "").trim();
    const totalRaw = row[10];
    const unitRaw = row[5];
    const discountRaw = row[8];
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
    lines.push({ service, amount });
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

async function findExistingDaycareSession(sessionDate, marker) {
  const { data, error } = await sb
    .from("daycare_sessions")
    .select("id, notes")
    .eq("owner_id", OWNER_ID)
    .eq("pet_id", PET_ID)
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
    subtotal_aed: grossTotal,
    discount_pct: 0,
    discount_aed: 0,
    discount_amount: 0,
    total: grossTotal,
    total_aed: grossTotal,
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

async function ensureDaycareSession({ sessionDate, description, invoiceId }) {
  const marker = `${INGEST_KEY}:${description}`;
  const existing = await findExistingDaycareSession(sessionDate, marker);
  if (existing) return existing.id;

  const { checkIn, checkOut } = parseSessionTimes(description);
  const checkInAt = checkIn ? `${sessionDate}T${checkIn}+04:00` : `${sessionDate}T08:30:00+04:00`;
  const checkOutAt = checkOut ? `${sessionDate}T${checkOut}+04:00` : null;
  const notes = [`${marker}`, "BILLING_PATH:hourly", invoiceId ? `HOURLY_INVOICED:${invoiceId}` : null]
    .filter(Boolean)
    .join("\n");

  if (DRY_RUN) {
    console.log(`  [dry-run] daycare session ${sessionDate} ${description}`);
    return "dry-run-session-id";
  }

  const { data, error } = await sb
    .from("daycare_sessions")
    .insert({
      owner_id: OWNER_ID,
      pet_id: PET_ID,
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

async function markSessionInvoiced(sessionId, notesFragment, invoiceId) {
  if (DRY_RUN || sessionId.startsWith("dry-run")) return;
  const { data, error } = await sb.from("daycare_sessions").select("notes").eq("id", sessionId).single();
  if (error) throw error;
  const base = (data.notes ?? "").split("\n").filter(Boolean);
  if (!base.some((line) => line.startsWith("HOURLY_INVOICED:"))) {
    base.push(`HOURLY_INVOICED:${invoiceId}`);
  }
  await sb.from("daycare_sessions").update({ notes: base.join("\n") }).eq("id", sessionId);
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — writing to Supabase");
  const lines = loadCreditLines();
  console.log(`Loaded ${lines.length} credit-detail lines`);

  const existingTopUp = await findExistingTx("Receipt #92834");
  if (existingTopUp) console.log("Resuming ingest (Receipt #92834 already present).");
  let balance = await getOwnerBalance();
  console.log(`Starting wallet balance: AED ${balance}`);

  for (const line of lines) {
    const { service, amount } = line;
    const sessionDate = parseMayDate(service);
    const tsBase = sessionDate ? `${sessionDate}T12:00:00+04:00` : "2026-05-01T10:00:00+04:00";

    if (/paid tt/i.test(service)) {
      if (await findExistingTx("Receipt #92834")) {
        console.log("Skip top-up (already recorded)");
        continue;
      }
      balance = round2(balance + amount);
      await insertWalletTx({
        type: "top_up",
        amount,
        balanceAfter: balance,
        notes: `Receipt #92834 — Paid TT (May 1 2026). ${INGEST_KEY}`,
        createdAt: "2026-05-01T10:00:00+04:00",
      });
      console.log(`Top-up AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/pending #92045/i.test(service)) {
      if (await findExistingTx("Paid invoice #92045")) {
        console.log("Skip historical #92045 (already recorded)");
        continue;
      }
      const invoiceNumber = "92045";
      let invoiceId = (await findExistingInvoice(invoiceNumber))?.id;
      if (!invoiceId) {
        const { data: byNotes } = await sb
          .from("invoices")
          .select("id")
          .eq("owner_id", OWNER_ID)
          .ilike("notes", "%legacy receipt #92045%")
          .limit(1);
        invoiceId = byNotes?.[0]?.id;
      }
      if (!invoiceId) {
        invoiceId = await createInvoice({
          invoiceNumber,
          serviceType: "adjustment",
          referenceId: null,
          grossTotal: amount,
          issueDate: "2026-05-01",
          paidAt: "2026-05-01T10:05:00+04:00",
          notes: `Legacy pending balance #92045. ${INGEST_KEY}`,
          lineDescription: "Historical balance — legacy receipt #92045",
          quantity: 1,
          unitPrice: amount,
          pricingKey: null,
        });
      }
      balance = round2(balance - amount);
      await insertWalletTx({
        type: "deduction",
        amount: -amount,
        balanceAfter: balance,
        notes: `Paid invoice #92045 from wallet. ${INGEST_KEY}`,
        invoiceId,
        createdAt: "2026-05-01T10:06:00+04:00",
      });
      console.log(`Historical #92045 AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/sspl/i.test(service)) {
      const invoiceNumber = `92834-SSPL-${sessionDate}`;
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
          quantity: 1,
          unitPrice: amount,
          pricingKey: null,
        });
      }
      balance = round2(balance - amount);
      await insertWalletTx({
        type: "deduction",
        amount: -amount,
        balanceAfter: balance,
        notes: `Paid ${service} from wallet. ${INGEST_KEY}`,
        invoiceId,
        createdAt: `${sessionDate}T15:01:00+04:00`,
      });
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/dcare/i.test(service)) {
      if (amount <= 0) {
        await ensureDaycareSession({ sessionDate, description: service, invoiceId: null });
        console.log(`${service} (no charge) — session only`);
        continue;
      }

      const hours = round2(amount / HOURLY_UNIT_RATE);
      const slug = service.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
      const invoiceNumber = `92834-DC-${slug}`;
      const marker = `${INGEST_KEY}:${service}`;
      let sessionId = (await findExistingDaycareSession(sessionDate, marker))?.id;
      if (!sessionId) {
        sessionId = await ensureDaycareSession({ sessionDate, description: service, invoiceId: null });
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
          referenceId: sessionId,
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: tsBase,
          notes: `${marker}. ${service}`,
          lineDescription: `Daycare hourly — Raja (${hours} hr @ AED ${HOURLY_UNIT_RATE}/hr)`,
          quantity: 1,
          unitPrice: amount,
          pricingKey: "daycare_hourly_single_day",
        });
      }
      await markSessionInvoiced(sessionId, marker, invoiceId);

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
  console.log(`Done. Final wallet balance: AED ${balance} (expected -940.75 credit => 940.75)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
