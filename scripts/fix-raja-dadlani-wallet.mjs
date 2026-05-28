/**
 * Correct Raja Dadlani wallet: no negative balance; unpaid invoices after wallet exhausted.
 * Paid through May 12 daycare (balance AED 56.75 remaining).
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const OWNER_ID = "8a4b428d-b0c2-4b64-88d4-41c447d3f9e9";
const INGEST_KEY = "LEGACY:92834";
const FINAL_BALANCE = 56.75;

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clearHourlyInvoiced(notes, invoiceId) {
  const lines = (notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(`HOURLY_INVOICED:${invoiceId}`));
  return lines.length ? lines.join("\n") : null;
}

async function main() {
  const { data: txs, error: txErr } = await sb
    .from("wallet_transactions")
    .select("id, amount, balance_after, notes, invoice_id, created_at, transaction_type")
    .eq("owner_id", OWNER_ID)
    .order("created_at");
  if (txErr) throw txErr;

  const deductions = txs.filter((t) => t.transaction_type === "deduction");
  const toRemove = deductions.filter((t) => round2(t.balance_after) < 0);

  console.log(`Removing ${toRemove.length} wallet deductions that drove balance negative`);

  for (const tx of toRemove) {
    if (!tx.invoice_id) continue;

    const { data: inv, error: invErr } = await sb
      .from("invoices")
      .select("id, notes, service_id, service_type")
      .eq("id", tx.invoice_id)
      .single();
    if (invErr) throw invErr;

    const { error: invUpdErr } = await sb
      .from("invoices")
      .update({
        status: "finalised",
        payment_method: null,
        paid_at: null,
        amount_paid: 0,
      })
      .eq("id", tx.invoice_id);
    if (invUpdErr) throw invUpdErr;

    if (inv.service_type === "daycare" && inv.service_id) {
      const { data: session } = await sb
        .from("daycare_sessions")
        .select("id, notes")
        .eq("id", inv.service_id)
        .maybeSingle();
      if (session) {
        await sb
          .from("daycare_sessions")
          .update({ notes: clearHourlyInvoiced(session.notes, tx.invoice_id) })
          .eq("id", session.id);
      }
    }

    const { error: delErr } = await sb.from("wallet_transactions").delete().eq("id", tx.id);
    if (delErr) throw delErr;
    console.log(`  reverted invoice ${tx.invoice_id} (${tx.notes?.slice(0, 40)})`);
  }

  const { data: remaining, error: remErr } = await sb
    .from("wallet_transactions")
    .select("id, amount, transaction_type")
    .eq("owner_id", OWNER_ID)
    .order("created_at");
  if (remErr) throw remErr;

  let running = 0;
  for (const tx of remaining) {
    running = round2(running + tx.amount);
    await sb.from("wallet_transactions").update({ balance_after: running }).eq("id", tx.id);
  }

  await sb.from("owners").update({ wallet_balance: FINAL_BALANCE }).eq("id", OWNER_ID);

  const { data: invs } = await sb
    .from("invoices")
    .select("status")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%${INGEST_KEY}%`);

  const paid = invs.filter((i) => i.status === "paid").length;
  const unpaid = invs.filter((i) => i.status === "finalised").length;

  console.log(`Done. Wallet AED ${FINAL_BALANCE}. Paid invoices: ${paid}, unpaid (finalised): ${unpaid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
