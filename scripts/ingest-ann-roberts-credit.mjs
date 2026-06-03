/**
 * Idempotent legacy ingest for Ann Roberts / CL000438 (pet Monty).
 * Source: Tax Invoice Monty Roberts April 13 2026 Credit from MSH to use.xlsx
 *
 * Usage: node scripts/ingest-ann-roberts-credit.mjs
 *        node scripts/ingest-ann-roberts-credit.mjs --dry-run
 */
import XLSX from "xlsx";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH =
  "/Users/nawalhilal/Downloads/Tax Invoice Monty Roberts April 13 2026 Credit from MSH to use.xlsx";

const OWNER_ID = "08823ce2-2d2a-4d9a-958c-c9439a8ceb58";
const PET_MONTY = "0116e779-76a1-4590-a301-cc863e78c230";
const PACKAGE_DEF_ID = "1adc1cbd-981d-45c1-aee4-1661df7151ba";
const INGEST_KEY = "LEGACY:MSH-ROBERTS-APR13";
const TRACKER = "PKG-MSH-MONTY-260413";
const MSH_RECEIPT = "46155";
const EXPECTED_BALANCE = 801.23;
const MSH_CREDIT = 1389.23;
const LUCKY7_AMOUNT = 588;
const ISSUE_DATE = "2026-04-13";
const EXPIRES_DATE = "2026-06-13";
const VAT_RATE = 0.05;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

function loadCreditLines() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames.includes("Credit details") ? "Credit details" : "Credit";
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const lines = [];
  for (const row of rows.slice(13)) {
    const service = String(row[1] ?? "").trim();
    const totalRaw = row[10];
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : parseFloat(String(totalRaw).replace(/[^0-9.-]/g, ""));

    let amount = 0;
    if (Number.isFinite(total)) amount = Math.abs(total);

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
    .select("id")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%${notesFragment}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findPackageInvoice() {
  const { data, error } = await sb
    .from("invoices")
    .select("id, invoice_number, total")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%tracker=${TRACKER}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function ensureLuckySevenPackage() {
  const existing = await findPackageInvoice();
  if (existing) {
    console.log(`Skip Lucky 7 package (tracker ${TRACKER} already exists as ${existing.invoice_number})`);
    return existing.id;
  }

  const vatAed = vatFromGross(LUCKY7_AMOUNT);
  const paidAt = `${ISSUE_DATE}T11:00:00+04:00`;
  const notes =
    `Legacy daycare package purchase | tracker=${TRACKER} | raw_type=Lucky Seven | msh_receipt=${MSH_RECEIPT} | ${INGEST_KEY}`;

  if (DRY_RUN) {
    console.log(`  [dry-run] lucky_7 package invoice AED ${LUCKY7_AMOUNT}`);
    return "dry-run-invoice-id";
  }

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .insert({
      owner_id: OWNER_ID,
      issue_date: ISSUE_DATE,
      status: "paid",
      subtotal: LUCKY7_AMOUNT,
      discount_amount: 0,
      discount_pct: 0,
      total: LUCKY7_AMOUNT,
      vat_aed: vatAed,
      payment_method: "wallet",
      service_type: "package",
      notes,
      paid_at: paidAt,
      amount_paid: LUCKY7_AMOUNT,
      created_at: paidAt,
      updated_at: paidAt,
    })
    .select("id")
    .single();
  if (invErr) throw invErr;

  const { data: pg, error: pgErr } = await sb
    .from("purchase_groups")
    .insert({
      owner_id: OWNER_ID,
      invoice_id: inv.id,
      package_def_id: PACKAGE_DEF_ID,
      pet_count: 1,
      multi_pet_discount_applied: 0,
    })
    .select("id")
    .single();
  if (pgErr) throw pgErr;

  const { error: liErr } = await sb.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: "Package: lucky_7 (7 sessions) — Monty",
    quantity: 1,
    unit_price: LUCKY7_AMOUNT,
    total_price: LUCKY7_AMOUNT,
    line_total: LUCKY7_AMOUNT,
    service_type: "package",
    sort_order: 0,
    created_at: paidAt,
  });
  if (liErr) throw liErr;

  const { error: scErr } = await sb.from("service_credits").insert({
    pet_id: PET_MONTY,
    service_code: "daycare_full_day",
    units_total: 7,
    units_consumed: 0,
    expires_at: EXPIRES_DATE,
    source_type: "package_purchase",
    source_ref_id: inv.id,
    purchase_group_id: pg.id,
    is_bonus: false,
    status: "active",
    created_at: paidAt,
  });
  if (scErr) throw scErr;

  console.log(`Created Lucky 7 package invoice (${inv.id})`);
  return inv.id;
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — writing to Supabase");
  const lines = loadCreditLines();
  console.log(`Loaded ${lines.length} credit lines from MSH file`);

  if (await findExistingTx(INGEST_KEY)) {
    console.log(`Resuming ingest (${INGEST_KEY} already present).`);
  }

  let balance = await getOwnerBalance();
  console.log(`Starting wallet balance: AED ${balance}`);

  for (const line of lines) {
    const { service, amount } = line;

    if (/credit from my second home/i.test(service)) {
      if (await findExistingTx("Credit from My Second Home")) {
        console.log("Skip MSH credit top-up (already recorded)");
        continue;
      }
      balance = round2(balance + amount);
      await insertWalletTx({
        type: "top_up",
        amount,
        balanceAfter: balance,
        notes: `Credit from My Second Home (Apr 13 2026). ${INGEST_KEY}`,
        createdAt: `${ISSUE_DATE}T10:00:00+04:00`,
      });
      console.log(`MSH credit top-up AED ${amount} -> balance ${balance}`);
      continue;
    }

    if (/lucky seven/i.test(service)) {
      const invoiceId = await ensureLuckySevenPackage();
      if (!(await findExistingTx("Paid Lucky Seven from wallet"))) {
        balance = round2(balance - amount);
        await insertWalletTx({
          type: "deduction",
          amount: -amount,
          balanceAfter: balance,
          notes: `Paid Lucky Seven from wallet (MSH receipt #${MSH_RECEIPT}). ${INGEST_KEY}`,
          invoiceId: invoiceId.startsWith("dry-run") ? null : invoiceId,
          createdAt: `${ISSUE_DATE}T11:01:00+04:00`,
        });
      }
      console.log(`Lucky Seven package AED ${amount} -> balance ${balance}`);
      continue;
    }

    console.warn(`Skipped unrecognized line: ${service}`);
  }

  await setOwnerBalance(balance);
  console.log(`Done. Final wallet balance: AED ${balance} (expected ${EXPECTED_BALANCE})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
