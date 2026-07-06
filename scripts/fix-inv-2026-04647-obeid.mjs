/**
 * Fix INV-2026-04647 (Chadi/Lina Obeid): card payment at pre-discount subtotal.
 *
 * Invoice total is AED 73.50 (AED 5.25 discount on AED 78.75 daycare). Card
 * payment was recorded at AED 78.75 instead of AED 73.50.
 *
 * Usage:
 *   node scripts/fix-inv-2026-04647-obeid.mjs
 *   node scripts/fix-inv-2026-04647-obeid.mjs --dry-run
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const FIX_KEY = "FIX:INV-2026-04647-PAYMENT-AMOUNT";

const INVOICE_ID = "2423095c-f2cd-4f52-b559-78b51f80884e";
const PAYMENT_ID = "99372ea9-77d8-4d44-8399-821dfcf7585a";
const CARD_LEDGER_TX_ID = "413e14b9-6a4f-4f98-a19e-8797bf77b38f";
const CORRECT_AMOUNT = 73.5;
const WRONG_AMOUNT = 78.75;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN — fixing INV-2026-04647");

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .select("invoice_number, status, subtotal, discount_amount, total, amount_paid, payment_method")
    .eq("id", INVOICE_ID)
    .single();
  if (invErr) throw invErr;

  const { data: owner, error: ownerErr } = await sb
    .from("owners")
    .select("first_name, last_name")
    .eq("id", "5cc063bd-b3da-412a-8103-37567edec53b")
    .single();
  if (ownerErr) throw ownerErr;

  console.log(`${inv.invoice_number} — ${owner.first_name} ${owner.last_name}`);
  console.log(
    `  subtotal=AED ${inv.subtotal} discount=AED ${inv.discount_amount} total=AED ${inv.total}`,
  );
  console.log(`  amount_paid=AED ${inv.amount_paid} (should be AED ${CORRECT_AMOUNT})`);

  if (Number(inv.amount_paid) === CORRECT_AMOUNT) {
    console.log("\nAlready corrected — nothing to do.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nWould:");
    console.log(`  set invoice_payment ${PAYMENT_ID} amount AED ${WRONG_AMOUNT} → ${CORRECT_AMOUNT}`);
    console.log(`  set card ledger tx ${CARD_LEDGER_TX_ID} amount → ${CORRECT_AMOUNT}`);
    console.log(`  set invoice amount_paid → ${CORRECT_AMOUNT}`);
    return;
  }

  const { error: payErr } = await sb
    .from("invoice_payments")
    .update({ amount: CORRECT_AMOUNT, closing_balance: -CORRECT_AMOUNT })
    .eq("id", PAYMENT_ID)
    .eq("amount", WRONG_AMOUNT);
  if (payErr) throw payErr;
  console.log(`invoice_payment corrected to AED ${CORRECT_AMOUNT}`);

  const { error: txErr } = await sb
    .from("wallet_transactions")
    .update({ amount: CORRECT_AMOUNT })
    .eq("id", CARD_LEDGER_TX_ID)
    .eq("amount", WRONG_AMOUNT);
  if (txErr) throw txErr;
  console.log("Card ledger row corrected");

  const { error: invUpdErr } = await sb
    .from("invoices")
    .update({ amount_paid: CORRECT_AMOUNT })
    .eq("id", INVOICE_ID)
    .eq("amount_paid", WRONG_AMOUNT);
  if (invUpdErr) throw invUpdErr;

  console.log(`Invoice amount_paid → AED ${CORRECT_AMOUNT}. ${FIX_KEY}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
