/**
 * Fix Akira & Cade wallet: cap wallet payments at available credit,
 * mark May 12 partially_paid, May 18/20 outstanding. Remove adjustment invoice.
 *
 * Breakpoint: after Apr 27 wallet had AED 71.75; May 12 invoice AED 105.
 *
 * Usage:
 *   node scripts/fix-akira-wallet-balance.mjs
 *   node scripts/fix-akira-wallet-balance.mjs --dry-run
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

const OWNER_ID = "f513fed0-8ebb-44a9-96e3-2384269d53f8";
const ADJUSTMENT_INVOICE_ID = "8b7f1656-4341-4791-a6e8-69acbe889205";

const MAY12_INVOICE_ID = "3405b243-49ae-4097-a771-43e783a0c8a5";
const MAY12_WALLET_TX_ID = "5274f8af-4411-4a5b-b051-3766c29ba85e";
const MAY12_WALLET_PAID = 71.75;
const MAY12_UNPAID = 33.25;

const MAY18_INVOICE_ID = "b67a8257-31b3-4975-9b41-7ba7b0365958";
const MAY18_WALLET_TX_ID = "ab1e5fa3-9ee6-4bf3-b92a-0c2529b1acbb";

const MAY20_INVOICE_ID = "8f8cfa1f-6f39-419f-a0fc-2711275a0e64";
const MAY20_WALLET_TX_ID = "0592411e-5326-4286-900f-756930d063fb";

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log(DRY_RUN ? "DRY RUN" : "LIVE RUN");
  console.log("Wallet breakpoint: AED 71.75 remaining before May 12 (AED 105 invoice)");

  if (DRY_RUN) {
    console.log(`Delete adjustment invoice ${ADJUSTMENT_INVOICE_ID}`);
    console.log(`May 12: partially_paid — wallet AED ${MAY12_WALLET_PAID}, owed AED ${MAY12_UNPAID}`);
    console.log("May 18 + May 20: outstanding — remove wallet deductions");
    console.log("Owner wallet → AED 0");
    return;
  }

  await sb.from("invoice_line_items").delete().eq("invoice_id", ADJUSTMENT_INVOICE_ID);
  const { error: delAdjErr } = await sb.from("invoices").delete().eq("id", ADJUSTMENT_INVOICE_ID);
  if (delAdjErr) throw delAdjErr;
  console.log("Removed adjustment invoice INV-2026-02518");

  const { error: may12InvErr } = await sb
    .from("invoices")
    .update({
      status: "partially_paid",
      amount_paid: MAY12_WALLET_PAID,
      payment_method: "wallet",
    })
    .eq("id", MAY12_INVOICE_ID);
  if (may12InvErr) throw may12InvErr;

  const { error: may12TxErr } = await sb
    .from("wallet_transactions")
    .update({
      amount: -MAY12_WALLET_PAID,
      balance_after: 0,
      notes: `Paid AED ${MAY12_WALLET_PAID} of May 12 Dcare from wallet (AED ${MAY12_UNPAID} outstanding). LEGACY:MSH-AKIRA-CADE-APR20`,
    })
    .eq("id", MAY12_WALLET_TX_ID);
  if (may12TxErr) throw may12TxErr;
  console.log(`May 12 invoice → partially_paid (paid ${MAY12_WALLET_PAID}, owed ${MAY12_UNPAID})`);

  for (const [label, invoiceId, txId] of [
    ["May 18", MAY18_INVOICE_ID, MAY18_WALLET_TX_ID],
    ["May 20", MAY20_INVOICE_ID, MAY20_WALLET_TX_ID],
  ]) {
    const { error: invErr } = await sb
      .from("invoices")
      .update({
        status: "finalised",
        amount_paid: 0,
        payment_method: null,
        paid_at: null,
      })
      .eq("id", invoiceId);
    if (invErr) throw invErr;

    const { error: txErr } = await sb.from("wallet_transactions").delete().eq("id", txId);
    if (txErr) throw txErr;
    console.log(`${label} invoice → finalised (wallet deduction removed)`);
  }

  const { error: ownerErr } = await sb.from("owners").update({ wallet_balance: 0 }).eq("id", OWNER_ID);
  if (ownerErr) throw ownerErr;
  console.log("Owner wallet → AED 0");
  console.log(
    `Total outstanding: AED ${MAY12_UNPAID + 126 + 63} (33.25 + 126 + 63) across 3 invoices`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
