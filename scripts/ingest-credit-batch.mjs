/**
 * Batch idempotent MSH credit ingest from Tax Invoice xlsx files.
 *
 * Usage:
 *   node scripts/ingest-credit-batch.mjs
 *   node scripts/ingest-credit-batch.mjs --dry-run
 *   node scripts/ingest-credit-batch.mjs --client lexi
 */
import XLSX from "xlsx";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const clientFilter = (() => {
  const i = process.argv.indexOf("--client");
  return i >= 0 ? process.argv[i + 1]?.toLowerCase() : null;
})();

const HOURLY_UNIT_RATE = 10.5;
const VAT_RATE = 0.05;

const CLIENTS = [
  {
    slug: "lexi",
    ownerId: "36a23cd3-c9d3-45d1-9bae-8cdb8a5bd51e",
    pets: { lexi: "80070e14-b9cc-4a38-ab25-a441ef21182e" },
    defaultPetKey: "lexi",
    file: "/Users/nawalhilal/Downloads/93096 Tax Invoice Lexi Binladen May 10 2026 TT credit.xlsx",
    creditSheet: "Credit",
    ingestKey: "LEGACY:MSH-LEXI-MAY10",
    receipt: "93096",
    expectedBalance: 285.5,
    issueDate: "2026-05-10",
  },
  {
    slug: "buttons",
    ownerId: "e1e69809-a331-4363-879a-4ffdecab18a9",
    pets: { buttons: "bb3c0ac2-f8ee-4dec-b1a9-7121ce18f35d" },
    defaultPetKey: "buttons",
    file: "/Users/nawalhilal/Downloads/93355 Tax Invoice buttons riaz May 20 2026 paid TT CREDIT (1).xlsx",
    creditSheet: "Credit details",
    ingestKey: "LEGACY:MSH-BUTTONS-MAY20",
    receipt: "93355",
    expectedBalance: 449,
    issueDate: "2026-05-20",
  },
  {
    slug: "ronin",
    ownerId: "a862a9ee-c875-490d-9402-dd2106fe327b",
    pets: { ronin: "796d9850-f144-42d2-9a51-d2a1b2a0c56e" },
    defaultPetKey: "ronin",
    file: "/Users/nawalhilal/Downloads/91404 Tax Invoice ronin yateem Mar 6 2026 paid TT Credit.xlsx",
    creditSheet: "Credit Details",
    ingestKey: "LEGACY:MSH-RONIN-MAR6",
    receipt: "91404",
    expectedBalance: 1077.25,
    issueDate: "2026-03-06",
  },
  {
    slug: "clay",
    ownerId: "757505c6-3778-4e9a-9912-871415eb4cd4",
    pets: { clay: "3102b97c-2507-44ea-a73d-0967bb0f20fb" },
    defaultPetKey: "clay",
    file: "/Users/nawalhilal/Downloads/92324 Tax Invoice clay beltran April 12 2026 cc Credit.xlsx",
    creditSheet: "Copy of Customer Invoice",
    ingestKey: "LEGACY:MSH-CLAY-APR12",
    receipt: "92324",
    expectedBalance: 57.75,
    issueDate: "2026-04-12",
  },
  {
    slug: "brooke",
    ownerId: "19920922-76a1-4aef-9d63-447b406af653",
    pets: {
      lucy: "5a4f589e-a148-4108-a4a5-f0287c6a7d03",
      brooke: "6638ea7d-96f4-4390-95b4-1d2b5d70a91f",
      barklee: "96a5a3ae-7bce-4802-8b01-b4bf84ea6988",
    },
    defaultPetKey: "lucy",
    file:
      "/Users/nawalhilal/Downloads/91775 Tax Invoice Lucy Brooke & barklee March 19-21 2026 cc credit.xlsx",
    creditSheet: "Credit details",
    ingestKey: "LEGACY:MSH-BROOKE-MAR21",
    receipt: "91775",
    expectedBalance: 12.9,
    issueDate: "2026-03-21",
  },
  {
    slug: "akira",
    ownerId: "f513fed0-8ebb-44a9-96e3-2384269d53f8",
    pets: {
      akira: "4feccd59-ff61-4c47-896b-0f39a8714dc9",
      cade: "954ed7e3-a776-4ec4-bade-7466fa8bd3f3",
    },
    defaultPetKey: "akira",
    file:
      "/Users/nawalhilal/Downloads/92536 Tax Invoice Akira & Cade Shetty April 20 2026 PL Credit pending.xlsx",
    creditSheet: "Credit Detail",
    ingestKey: "LEGACY:MSH-AKIRA-CADE-APR20",
    receipt: "92536",
    expectedBalance: 0,
    issueDate: "2026-04-20",
  },
  {
    slug: "mowgli",
    ownerId: "8b42b67c-e02f-4151-b4fb-692b5e3dc70f",
    pets: { mowgli: "5b83fb40-2a8e-4b61-a738-51d55e5c5327" },
    defaultPetKey: "mowgli",
    file:
      "/Users/nawalhilal/Downloads/90165 Tax Invoice Mowgli Sakaria Jan 15-Feb 6 2026 dep paid cc CREDIT.xlsx",
    creditSheet: "Credit details",
    ingestKey: "LEGACY:MSH-MOWGLI-MAR5",
    receipt: "90165",
    expectedBalance: 157.75,
    issueDate: "2026-03-05",
  },
  {
    slug: "adams",
    ownerId: "ff6d3693-8af5-431d-b4c7-c39c1d5746f2",
    pets: {
      chester: "a0281844-eef9-48b7-9963-8071aa4075d7",
      bella: "cb59f08c-0f5d-438d-8913-5f599e9f0572",
    },
    defaultPetKey: "chester",
    file:
      "/Users/nawalhilal/Downloads/92572 Tax Invoice Bella & Chester Adams April 22-May 9 2026 dep paid PL  credit.xlsx",
    creditSheet: "Balance",
    ingestKey: "LEGACY:MSH-ADAMS-APR22",
    receipt: "92572",
    expectedBalance: 1268.3,
    issueDate: "2026-04-22",
  },
  {
    slug: "ollie",
    ownerId: "b06b21f6-1a5d-4c6f-ba40-d17aeceed2fd",
    pets: { ollie: "8d3ef0f8-b2bd-4504-a92e-355f8b4c3000" },
    defaultPetKey: "ollie",
    file:
      "/Users/nawalhilal/Downloads/87673  Tax Invoice Puku Toogood Oct 13 2025 paid TT  Credit Ollie Thompson to use.xlsx",
    creditSheet: "Credit Details",
    ingestKey: "LEGACY:MSH-OLLIE-OCT13",
    receipt: "87673",
    expectedBalance: 616.75,
    issueDate: "2025-10-13",
  },
];

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

const FULL_MONTHS = {
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

const SHORT_MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseMonthDay(label) {
  const full = label.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i,
  );
  if (full) {
    const month = FULL_MONTHS[full[1].toLowerCase()];
    return `2026-${String(month).padStart(2, "0")}-${String(full[2]).padStart(2, "0")}`;
  }
  const anywhere = label.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/i,
  );
  if (!anywhere) return null;
  const key = anywhere[1].toLowerCase().slice(0, 3);
  const month = FULL_MONTHS[anywhere[1].toLowerCase()] ?? SHORT_MONTHS[key];
  return `2026-${String(month).padStart(2, "0")}-${String(anywhere[2]).padStart(2, "0")}`;
}

function parseBoardingRange(service) {
  const m = service.match(
    /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?)\s+(\d{1,2})\s*-\s*(\d{1,2})\b/i,
  );
  if (!m) return null;
  const monthKey = m[1].toLowerCase().replace(".", "").slice(0, 3);
  const month = FULL_MONTHS[m[1].toLowerCase().replace(".", "")] ?? SHORT_MONTHS[monthKey];
  const start = `2026-${String(month).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const end = `2026-${String(month).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return { start, end };
}

function parseTimeToken(token) {
  const m = token.trim().match(/^(\d{1,2})(?:\.(\d{2}))?\s*(am|pm|om)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = (m[3] ?? "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem || meridiem === "om") {
    if (hour <= 7) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function parseSessionTimes(description) {
  const dcare = description.match(/Dcare\s+(.+)$/i);
  const chunk = dcare ? dcare[1].trim() : description;
  const timeRange = chunk.match(
    /(\d{1,2}(?:\.\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?:\.\d{2})?\s*(?:am|pm)?)/i,
  );
  if (timeRange) {
    return { checkIn: parseTimeToken(timeRange[1]), checkOut: parseTimeToken(timeRange[2]) };
  }
  if (!dcare) return { checkIn: null, checkOut: null };
  if (!chunk || chunk.endsWith("-")) return { checkIn: null, checkOut: null };
  const parts = chunk.split("-");
  if (parts.length === 1) return { checkIn: parseTimeToken(parts[0]), checkOut: null };
  return { checkIn: parseTimeToken(parts[0]), checkOut: parseTimeToken(parts[1]) };
}

function isDaycareLine(service) {
  if (/dcare|daycare/i.test(service)) return true;
  if (/trim|tidy|\bfs\b|demat|sspl|nails|boarding|credit|pending|assessment|deposit|lucky|pl credit/i.test(service)) {
    return false;
  }
  return /\d{1,2}(?:\.\d{2})?\s*(?:am|pm)?\s*-\s*/i.test(service);
}

function loadCreditLines(cfg) {
  const wb = XLSX.readFile(cfg.file);
  const sheetName =
    cfg.creditSheet ??
    wb.SheetNames.find((n) => /credit details|credit details|credit$/i.test(n) && !/customer|costumer/i.test(n)) ??
    wb.SheetNames.find((n) => /credit/i.test(n)) ??
    wb.SheetNames[1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const headerIdx = rows.findIndex((r) => String(r[1] ?? "").trim() === "Service");
  const start = headerIdx >= 0 ? headerIdx + 1 : 13;
  const lines = [];
  for (const row of rows.slice(start)) {
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
    if (Number.isFinite(total)) amount = Math.abs(total);
    else if (Number.isFinite(unit) && unit > 0) amount = unit;
    else if (Number.isFinite(discount) && discount > 0) amount = discount;

    const label0 = String(row[0] ?? "").trim();
    if (label0 === "Deposit Paid") {
      if (amount > 0) lines.push({ service: "Deposit Paid", qty: 1, amount, signed: amount });
      break;
    }

    if (!service) continue;
    if (service === "Deposit Paid" || service.startsWith("Total")) break;
    if (/^\d+$/.test(service) && amount === 0) continue;
    lines.push({ service, qty, amount, signed: total });
  }
  return lines;
}

/** MSH credit sheets sometimes show remaining credit as a negative total due. */
function parseFileTotalDue(cfg) {
  const wb = XLSX.readFile(cfg.file);
  const sheetName =
    cfg.creditSheet ??
    wb.SheetNames.find((n) => /credit details|credit detail|credit$/i.test(n) && !/customer|costumer/i.test(n)) ??
    wb.SheetNames.find((n) => /credit/i.test(n)) ??
    wb.SheetNames[1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  let totalDue = null;
  for (const row of rows) {
    const label = String(row[0] ?? row[1] ?? "").trim();
    if (label === "Total Balance Due Inclusive VAT" || label === "Total Due Inclusive VAT") {
      const raw =
        typeof row[10] === "number"
          ? row[10]
          : parseFloat(String(row[10]).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(raw)) totalDue = Math.abs(raw);
    }
  }
  return totalDue;
}

function isTopUpLine(service) {
  if (/pending\s+#/i.test(service)) return false;
  if (/dcare|daycare|sspl|nails|boarding|assessment|lucky seven|trim|tidy|\bfs\b|demat/i.test(service)) return false;
  if (/^deposit paid$/i.test(service)) return true;
  if (/depc\b|dep cc/i.test(service)) return true;
  if (/credit from my second home/i.test(service)) return true;
  if (/tt credit|cc credit|pl credit|paid tt/i.test(service)) return true;
  if (/credit refer|credit ref/i.test(service)) return true;
  if (/^credit\s*$/i.test(service)) return true;
  return false;
}

function petsForLine(cfg, line) {
  const { service, qty } = line;
  const petIds = Object.entries(cfg.pets)
    .filter(([name]) => new RegExp(name, "i").test(service))
    .map(([, id]) => id);
  if (petIds.length === 1) return petIds;
  if (petIds.length > 1) return petIds;
  if (qty >= 2 && Object.keys(cfg.pets).length >= 2) return Object.values(cfg.pets);
  return [cfg.pets[cfg.defaultPetKey]];
}

function invoiceSlug(service) {
  return service.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function getOwnerBalance(ownerId) {
  const { data, error } = await sb.from("owners").select("wallet_balance").eq("id", ownerId).single();
  if (error) throw error;
  return round2(data.wallet_balance ?? 0);
}

async function setOwnerBalance(ownerId, balance) {
  if (DRY_RUN) return;
  const { error } = await sb.from("owners").update({ wallet_balance: round2(balance) }).eq("id", ownerId);
  if (error) throw error;
}

async function insertWalletTx(cfg, { type, amount, balanceAfter, notes, invoiceId, createdAt }) {
  if (DRY_RUN) {
    console.log(`  [dry-run] wallet ${type} ${amount} -> balance ${balanceAfter}`);
    return null;
  }
  const { data, error } = await sb
    .from("wallet_transactions")
    .insert({
      owner_id: cfg.ownerId,
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

async function findExistingTx(cfg, notesFragment) {
  const { data, error } = await sb
    .from("wallet_transactions")
    .select("id")
    .eq("owner_id", cfg.ownerId)
    .ilike("notes", `%${notesFragment}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findExistingInvoice(cfg, invoiceNumber) {
  const { data, error } = await sb
    .from("invoices")
    .select("id")
    .eq("owner_id", cfg.ownerId)
    .eq("invoice_number", invoiceNumber)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findExistingDaycareSession(cfg, sessionDate, petId, marker) {
  const { data, error } = await sb
    .from("daycare_sessions")
    .select("id")
    .eq("owner_id", cfg.ownerId)
    .eq("pet_id", petId)
    .eq("session_date", sessionDate)
    .ilike("notes", `%${marker}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function createInvoice(cfg, {
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
  const payload = {
    owner_id: cfg.ownerId,
    invoice_number: invoiceNumber,
    service_type: serviceType,
    service_id: referenceId,
    booking_id: null,
    status: "finalised",
    payment_method: null,
    issue_date: issueDate,
    paid_at: null,
    amount_paid: 0,
    subtotal: grossTotal,
    discount_pct: 0,
    discount_amount: 0,
    total: grossTotal,
    vat_aed: vatFromGross(grossTotal),
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

async function settleInvoiceFromWallet(cfg, {
  balance,
  amount,
  invoiceId,
  serviceLabel,
  createdAt,
  txNote,
}) {
  if (await findExistingTx(cfg, txNote)) {
    return balance;
  }

  const walletPaid = round2(Math.min(Math.max(balance, 0), amount));
  const unpaid = round2(amount - walletPaid);
  const status = walletPaid >= amount ? "paid" : walletPaid > 0 ? "partially_paid" : "finalised";
  const newBalance = round2(balance - walletPaid);

  if (DRY_RUN) {
    console.log(
      `  [dry-run] settle ${serviceLabel}: wallet ${walletPaid}, owed ${unpaid} → ${status}, balance ${newBalance}`,
    );
    return newBalance;
  }

  if (invoiceId && !invoiceId.startsWith("dry-run")) {
    const { error: invErr } = await sb
      .from("invoices")
      .update({
        status,
        amount_paid: walletPaid,
        payment_method: walletPaid > 0 ? "wallet" : null,
        paid_at: walletPaid > 0 ? createdAt : null,
        updated_at: createdAt,
      })
      .eq("id", invoiceId);
    if (invErr) throw invErr;
  }

  if (walletPaid > 0) {
    const notes =
      unpaid > 0
        ? `Paid AED ${walletPaid} of ${serviceLabel} from wallet (AED ${unpaid} outstanding). ${cfg.ingestKey}`
        : `Paid ${serviceLabel} from wallet. ${cfg.ingestKey}`;
    await insertWalletTx(cfg, {
      type: "deduction",
      amount: -walletPaid,
      balanceAfter: newBalance,
      notes,
      invoiceId,
      createdAt,
    });
  } else {
    console.log(`${serviceLabel} AED ${amount} → finalised (no wallet credit)`);
  }

  return newBalance;
}

async function ensureDaycareSession(cfg, { sessionDate, description, petId, invoiceId, hourlyBilling }) {
  const marker = `${cfg.ingestKey}:${description}`;
  const existing = await findExistingDaycareSession(cfg, sessionDate, petId, marker);
  if (existing) return existing.id;

  const { checkIn, checkOut } = parseSessionTimes(description);
  const checkInAt = checkIn ? `${sessionDate}T${checkIn}+04:00` : `${sessionDate}T08:30:00+04:00`;
  const checkOutAt = checkOut ? `${sessionDate}T${checkOut}+04:00` : null;
  const notes = [
    marker,
    hourlyBilling ? "BILLING_PATH:hourly" : null,
    invoiceId ? `HOURLY_INVOICED:${invoiceId}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (DRY_RUN) {
    console.log(`  [dry-run] daycare ${sessionDate} ${description}`);
    return `dry-run-session-${petId.slice(0, 8)}`;
  }

  const { data, error } = await sb
    .from("daycare_sessions")
    .insert({
      owner_id: cfg.ownerId,
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
  if (!base.some((line) => line.startsWith("BILLING_PATH:"))) base.push("BILLING_PATH:hourly");
  if (!base.some((line) => line.startsWith("HOURLY_INVOICED:"))) base.push(`HOURLY_INVOICED:${invoiceId}`);
  await sb.from("daycare_sessions").update({ notes: base.join("\n") }).eq("id", sessionId);
}

async function ingestClient(cfg) {
  console.log(`\n========== ${cfg.slug.toUpperCase()} (${cfg.receipt}) ==========`);
  const lines = loadCreditLines(cfg).sort((a, b) => {
    const rank = (service) => (isTopUpLine(service) || /^deposit paid$/i.test(service) ? 0 : 1);
    return rank(a.service) - rank(b.service);
  });
  console.log(`Loaded ${lines.length} lines from ${cfg.file.split("/").pop()}`);

  let balance = await getOwnerBalance(cfg.ownerId);
  console.log(`Starting wallet balance: AED ${balance}`);

  for (const line of lines) {
    const { service, qty, amount } = line;
    const sessionDate = parseMonthDay(service) ?? cfg.issueDate;
    const tsBase = `${sessionDate}T12:00:00+04:00`;

    if (isTopUpLine(service)) {
      const noteKey = `Receipt #${cfg.receipt}`;
      const txKey = /credit refer|credit ref/i.test(service) ? `${service} (${cfg.receipt})` : noteKey;
      if (await findExistingTx(cfg, txKey)) {
        console.log(`Skip top-up: ${service}`);
        continue;
      }
      balance = round2(balance + amount);
      await insertWalletTx(cfg, {
        type: "top_up",
        amount,
        balanceAfter: balance,
        notes: `${service} (${cfg.receipt}). ${cfg.ingestKey}`,
        createdAt: `${cfg.issueDate}T10:00:00+04:00`,
      });
      console.log(`Top-up ${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/assessment/i.test(service)) {
      console.log(`${service} (no charge) — skipped`);
      continue;
    }

    const pending = service.match(/pending\s+#?(\d+)/i);
    if (pending) {
      const invoiceNumber = pending[1];
      const txNote = `Paid invoice #${invoiceNumber}`;
      if (await findExistingTx(cfg, txNote)) {
        console.log(`Skip pending #${invoiceNumber}`);
        continue;
      }
      let invoiceId = (await findExistingInvoice(cfg, invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice(cfg, {
          invoiceNumber,
          serviceType: "adjustment",
          referenceId: null,
          grossTotal: amount,
          issueDate: cfg.issueDate,
          paidAt: `${cfg.issueDate}T10:05:00+04:00`,
          notes: `Legacy pending balance #${invoiceNumber}. ${cfg.ingestKey}`,
          lineDescription: `Historical balance — legacy receipt #${invoiceNumber}`,
          quantity: 1,
          unitPrice: amount,
          pricingKey: null,
        });
      }
      balance = await settleInvoiceFromWallet(cfg, {
        balance,
        amount,
        invoiceId,
        serviceLabel: `invoice #${invoiceNumber}`,
        createdAt: `${cfg.issueDate}T10:06:00+04:00`,
        txNote,
      });
      console.log(`Pending #${invoiceNumber} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/boarding/i.test(service)) {
      const range = parseBoardingRange(service);
      const issueDate = range?.start ?? sessionDate;
      const invoiceNumber = `MSH-${cfg.slug.toUpperCase()}-BR-${invoiceSlug(service)}`;
      let invoiceId = (await findExistingInvoice(cfg, invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice(cfg, {
          invoiceNumber,
          serviceType: "boarding",
          referenceId: null,
          grossTotal: amount,
          issueDate,
          paidAt: `${issueDate}T16:00:00+04:00`,
          notes: `${service}. ${cfg.ingestKey}`,
          lineDescription: service,
          quantity: 1,
          unitPrice: amount,
          pricingKey: "boarding_night",
        });
      }
      balance = await settleInvoiceFromWallet(cfg, {
        balance,
        amount,
        invoiceId,
        serviceLabel: service,
        createdAt: `${issueDate}T16:01:00+04:00`,
        txNote: `Paid ${service} from wallet`,
      });
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/sspl/i.test(service)) {
      const invoiceNumber = `MSH-${cfg.slug.toUpperCase()}-SSPL-${sessionDate}`;
      let invoiceId = (await findExistingInvoice(cfg, invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice(cfg, {
          invoiceNumber,
          serviceType: "grooming",
          referenceId: null,
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: `${sessionDate}T15:00:00+04:00`,
          notes: `${service}. ${cfg.ingestKey}`,
          lineDescription: service,
          quantity: qty,
          unitPrice: round2(amount / qty),
          pricingKey: null,
        });
      }
      balance = await settleInvoiceFromWallet(cfg, {
        balance,
        amount,
        invoiceId,
        serviceLabel: service,
        createdAt: `${sessionDate}T15:01:00+04:00`,
        txNote: `Paid ${service} from wallet`,
      });
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/trim|tidy|nails|\bfs\b|demat/i.test(service)) {
      const invoiceNumber = `MSH-${cfg.slug.toUpperCase()}-NAILS-${sessionDate}`;
      let invoiceId = (await findExistingInvoice(cfg, invoiceNumber))?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice(cfg, {
          invoiceNumber,
          serviceType: "grooming",
          referenceId: null,
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: `${sessionDate}T14:00:00+04:00`,
          notes: `${service}. ${cfg.ingestKey}`,
          lineDescription: service,
          quantity: 1,
          unitPrice: amount,
          pricingKey: null,
        });
      }
      balance = await settleInvoiceFromWallet(cfg, {
        balance,
        amount,
        invoiceId,
        serviceLabel: service,
        createdAt: `${sessionDate}T14:01:00+04:00`,
        txNote: `Paid ${service} from wallet`,
      });
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (isDaycareLine(service)) {
      const petIds = petsForLine(cfg, line);
      const marker = `${cfg.ingestKey}:${service}`;

      if (amount <= 0) {
        for (const petId of petIds) {
          await ensureDaycareSession(cfg, {
            sessionDate,
            description: service,
            petId,
            invoiceId: null,
            hourlyBilling: false,
          });
        }
        console.log(`${service} (no charge) — session only`);
        continue;
      }

      const hours = round2(amount / HOURLY_UNIT_RATE);
      const invoiceNumber = `MSH-${cfg.slug.toUpperCase()}-DC-${invoiceSlug(service)}`;
      const sessionIds = [];
      for (const petId of petIds) {
        let sessionId = (await findExistingDaycareSession(cfg, sessionDate, petId, marker))?.id;
        if (!sessionId) {
          sessionId = await ensureDaycareSession(cfg, {
            sessionDate,
            description: service,
            petId,
            invoiceId: null,
            hourlyBilling: true,
          });
        }
        sessionIds.push(sessionId);
      }

      let invoiceId = (await findExistingInvoice(cfg, invoiceNumber))?.id;
      if (!invoiceId) {
        const { data: byNotes } = await sb
          .from("invoices")
          .select("id")
          .eq("owner_id", cfg.ownerId)
          .ilike("notes", `%${marker}%`)
          .limit(1);
        invoiceId = byNotes?.[0]?.id;
      }
      if (!invoiceId) {
        invoiceId = await createInvoice(cfg, {
          invoiceNumber,
          serviceType: "daycare",
          referenceId: sessionIds[0],
          grossTotal: amount,
          issueDate: sessionDate,
          paidAt: tsBase,
          notes: `${marker}. ${service}`,
          lineDescription: `Daycare hourly (${hours} hr @ AED ${HOURLY_UNIT_RATE}/hr)`,
          quantity: qty,
          unitPrice: round2(amount / qty),
          pricingKey: "daycare_hourly_single_day",
        });
      }
      for (const sessionId of sessionIds) await markSessionInvoiced(sessionId, invoiceId);

      balance = await settleInvoiceFromWallet(cfg, {
        balance,
        amount,
        invoiceId,
        serviceLabel: service,
        createdAt: `${sessionDate}T12:01:00+04:00`,
        txNote: `Paid ${service} from wallet`,
      });
      console.log(`${service} AED ${amount} -> balance ${balance}`);
      continue;
    }

    console.warn(`Skipped unrecognized line: ${service}`);
  }

  const fileTotalDue = parseFileTotalDue(cfg);
  if (fileTotalDue != null && cfg.expectedBalance >= 0) balance = fileTotalDue;

  await setOwnerBalance(cfg.ownerId, balance);
  console.log(`Done ${cfg.slug}. Final balance AED ${balance} (expected ${cfg.expectedBalance})`);
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — writing to Supabase");
  const targets = clientFilter ? CLIENTS.filter((c) => c.slug === clientFilter) : CLIENTS;
  if (targets.length === 0) {
    console.error(`Unknown client: ${clientFilter}`);
    process.exit(1);
  }
  for (const cfg of targets) {
    await ingestClient(cfg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
