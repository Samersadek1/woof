/**
 * PKG-84262-84380 — Pepe Sameni (Shervin) + Bobby Chamard (Mailys)
 *
 * Fixes:
 * - Move credits from synthetic pets to legacy CL001015 / CL000987 pets
 * - Balances from invoice daycare sheet: Pepe 30/15, Bobby 30/30
 * - Split purchase_group + legacy invoice per payer (receipt 84262 / 84380)
 * - Relink 45 migrated sessions (were on wrong SYN-PET-0023 Hazel/Hunter)
 * - Deactivate duplicate synthetic pets on SYN-CL-0025
 *
 * Usage:
 *   node scripts/fix-pepe-bobby-pkg-84262-84380.mjs          # dry-run
 *   node scripts/fix-pepe-bobby-pkg-84262-84380.mjs --apply
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const TRACKER = "PKG-84262-84380";

const CREDIT_PEPE = "5729a11a-22c7-44a2-9e51-f4cf0422e9aa";
const CREDIT_BOBBY = "e8e20dbd-bf7b-440f-adfb-4a2801b46e76";
const PG_ID = "83743373-5955-4d4e-a17e-a99780047dea";
const INV_PEPE_ID = "051482d2-e682-421e-b246-536d8af26477";
const LINE_ITEM_ID = "4de205e4-5ee9-4234-b514-a50a80340be5";

const SHERVIN = "ae86f9c7-0ea0-4ad9-b3c4-3e15eb60fd2e";
const MAILYS = "bb753a25-282f-48ff-80f8-d860b1463a42";
const LEGACY_PEPE = "12774ed9-d0de-4e3f-8466-b94185aaee4a";
const LEGACY_BOBBY = "028e18a5-3258-4101-a6f2-8477f9546136";
const SYN_PET_PEPE = "b451afb5-517a-408b-b379-ce63d7bd03a3";
const SYN_PET_BOBBY = "6813ee07-79b9-4810-8f64-e409bc9c7989";
const PKG_DEF = "26f00052-5726-4f53-b71b-d9ecdad0e604";

const HALF_SUBTOTAL = 2197.35;
const HALF_TOTAL = 2197.35;
const HALF_VAT = Math.round((HALF_TOTAL - HALF_TOTAL / 1.05) * 100) / 100;

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function isPepeSession(notes) {
  const raw = (notes.match(/date_raw=([^|]+)/) || [])[1]?.trim() ?? "";
  if (raw.startsWith("Pepe")) return true;
  if (raw.startsWith("Bobby")) return false;
  const slot = (notes.match(/slot=(U\d+)/) || [])[1];
  if (!slot) return false;
  const n = parseInt(slot.slice(1), 10);
  return n >= 1 && n <= 15;
}

async function main() {
  const { data: sessions, error: sessErr } = await sb
    .from("daycare_sessions")
    .select("id, notes, pet_id, owner_id, package_id")
    .ilike("notes", `%tracker=${TRACKER}%`);
  if (sessErr) throw sessErr;

  const pepeSessions = [];
  const bobbySessions = [];
  for (const s of sessions ?? []) {
    if (isPepeSession(s.notes)) pepeSessions.push(s.id);
    else bobbySessions.push(s.id);
  }

  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");
  console.log(`Sessions: ${sessions?.length ?? 0} (Pepe ${pepeSessions.length}, Bobby ${bobbySessions.length})`);

  if (pepeSessions.length !== 15 || bobbySessions.length !== 30) {
    throw new Error(
      `Expected 15 Pepe + 30 Bobby sessions, got ${pepeSessions.length} + ${bobbySessions.length}`,
    );
  }

  const plan = {
    credits: [
      { id: CREDIT_PEPE, pet_id: LEGACY_PEPE, units_total: 30, units_consumed: 15, purchase_group_id: PG_ID },
      { id: CREDIT_BOBBY, pet_id: LEGACY_BOBBY, units_total: 30, units_consumed: 30, purchase_group_id: "(new PG for Mailys)" },
    ],
    invoicePepe: { id: INV_PEPE_ID, owner_id: SHERVIN, receipt: "84262" },
    invoiceBobby: { owner_id: MAILYS, receipt: "84380" },
    sessionsPepe: pepeSessions.length,
    sessionsBobby: bobbySessions.length,
    deactivatePets: [SYN_PET_PEPE, SYN_PET_BOBBY],
  };
  console.log(JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nRe-run with --apply to execute.");
    return;
  }

  // 1) Bobby invoice + purchase group (Pepe keeps existing invoice/PG)
  const { data: invBobby, error: invErr } = await sb
    .from("invoices")
    .insert({
      owner_id: MAILYS,
      issue_date: "2025-06-16",
      status: "paid",
      subtotal: HALF_SUBTOTAL,
      subtotal_aed: HALF_SUBTOTAL,
      discount_amount: 0,
      discount_aed: 0,
      discount_pct: 0,
      total: HALF_TOTAL,
      total_aed: HALF_TOTAL,
      vat_aed: HALF_VAT,
      payment_method: "card",
      service_type: "package",
      notes: `Legacy daycare package purchase | tracker=${TRACKER} | receipt=84380 | raw_type=30 Day Ticket | pet=Bobby Chamard`,
      paid_at: new Date().toISOString(),
      amount_paid: HALF_TOTAL,
    })
    .select("id")
    .single();
  if (invErr) throw invErr;

  const { data: pgBobby, error: pgErr } = await sb
    .from("purchase_groups")
    .insert({
      owner_id: MAILYS,
      invoice_id: invBobby.id,
      package_def_id: PKG_DEF,
      pet_count: 1,
      multi_pet_discount_applied: 10,
      staff_label: "Bobby Chamard — receipt 84380",
    })
    .select("id")
    .single();
  if (pgErr) throw pgErr;

  const { error: lineErr } = await sb.from("invoice_line_items").insert({
    invoice_id: invBobby.id,
    description: "Package: thirty_day_ticket (30 sessions) — Bobby",
    quantity: 1,
    unit_price: HALF_SUBTOTAL,
    total_price: HALF_TOTAL,
    line_total: HALF_TOTAL,
    service_type: "package",
  });
  if (lineErr) throw lineErr;

  // 2) Pepe invoice + PG (existing rows)
  const { error: invPepeErr } = await sb
    .from("invoices")
    .update({
      owner_id: SHERVIN,
      issue_date: "2025-06-13",
      notes: `Legacy daycare package purchase | tracker=${TRACKER} | receipt=84262 | raw_type=30 Day Ticket | pet=Pepe Sameni`,
      subtotal: HALF_SUBTOTAL,
      subtotal_aed: HALF_SUBTOTAL,
      total: HALF_TOTAL,
      total_aed: HALF_TOTAL,
      vat_aed: HALF_VAT,
      amount_paid: HALF_TOTAL,
    })
    .eq("id", INV_PEPE_ID);
  if (invPepeErr) throw invPepeErr;

  const { error: linePepeErr } = await sb
    .from("invoice_line_items")
    .update({
      description: "Package: thirty_day_ticket (30 sessions) — Pepe",
      unit_price: HALF_SUBTOTAL,
      total_price: HALF_TOTAL,
      line_total: HALF_TOTAL,
    })
    .eq("id", LINE_ITEM_ID);
  if (linePepeErr) throw linePepeErr;

  const { error: pgPepeErr } = await sb
    .from("purchase_groups")
    .update({
      owner_id: SHERVIN,
      pet_count: 1,
      staff_label: "Pepe Sameni — receipt 84262",
    })
    .eq("id", PG_ID);
  if (pgPepeErr) throw pgPepeErr;

  // 3) Credits
  const { error: cPepeErr } = await sb
    .from("service_credits")
    .update({
      pet_id: LEGACY_PEPE,
      units_total: 30,
      units_consumed: 15,
      purchase_group_id: PG_ID,
      source_ref_id: INV_PEPE_ID,
    })
    .eq("id", CREDIT_PEPE);
  if (cPepeErr) throw cPepeErr;

  const { error: cBobbyErr } = await sb
    .from("service_credits")
    .update({
      pet_id: LEGACY_BOBBY,
      units_total: 30,
      units_consumed: 30,
      purchase_group_id: pgBobby.id,
      source_ref_id: invBobby.id,
    })
    .eq("id", CREDIT_BOBBY);
  if (cBobbyErr) throw cBobbyErr;

  // 4) Sessions — batch by pet
  for (const id of pepeSessions) {
    const { error } = await sb
      .from("daycare_sessions")
      .update({
        pet_id: LEGACY_PEPE,
        owner_id: SHERVIN,
        package_id: CREDIT_PEPE,
      })
      .eq("id", id);
    if (error) throw error;
  }
  for (const id of bobbySessions) {
    const { error } = await sb
      .from("daycare_sessions")
      .update({
        pet_id: LEGACY_BOBBY,
        owner_id: MAILYS,
        package_id: CREDIT_BOBBY,
      })
      .eq("id", id);
    if (error) throw error;
  }

  // 5) Retire duplicate synthetic pets
  const { error: petErr } = await sb
    .from("pets")
    .update({ active: false, status: "merged" })
    .in("id", [SYN_PET_PEPE, SYN_PET_BOBBY]);
  if (petErr) throw petErr;

  console.log("\nDone.");
  console.log(`  Pepe invoice: ${INV_PEPE_ID} (Shervin)`);
  console.log(`  Bobby invoice: ${invBobby.id} (Mailys)`);
  console.log(`  Bobby purchase_group: ${pgBobby.id}`);

  // Verification
  const { data: verify } = await sb
    .from("service_credits")
    .select("id, pet_id, units_total, units_consumed, pets(name), purchase_groups(owner_id, owners(first_name, last_name))")
    .in("id", [CREDIT_PEPE, CREDIT_BOBBY]);
  console.log("\nVerify credits:", JSON.stringify(verify, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
