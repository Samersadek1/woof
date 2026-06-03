/**
 * Dave/Naz Holland — Lucky Seven packages purchased 10 Feb 2026
 *
 * Archie: 10-Feb, 16-Feb, 24-Feb, 26-Feb, 21-Apr, 27-Apr, 30-Apr
 * Pugslee: 10-Feb, 16-Feb, 26-Feb, 21-Apr, 27-Apr, 30-Apr, 11-May
 *
 * Usage:
 *   node scripts/ingest-holland-lucky7-feb10.mjs          # dry-run
 *   node scripts/ingest-holland-lucky7-feb10.mjs --apply
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

const OWNER_ID = "060f64ed-7fa9-4c6b-a874-3b6da745d31e";
const ARCHIE_PET_ID = "368ce806-8313-4de1-bb89-fd734902bc93";
const PUGSLEE_PET_ID = "b6fcc0ff-4352-49ed-9bf2-05bdd6f2793d";
const PACKAGE_DEF_ID = "1adc1cbd-981d-45c1-aee4-1661df7151ba";
const LUCKY7_AMOUNT = 588;
const ISSUE_DATE = "2026-02-10";
const VAT_RATE = 0.05;

const PACKAGES = [
  {
    tracker: "PKG-HOLLAND-ARCHIE-260210",
    petId: ARCHIE_PET_ID,
    petName: "Archie",
    expiresAt: "2026-05-10",
    sessions: [
      "2026-02-10",
      "2026-02-16",
      "2026-02-24",
      "2026-02-26",
      "2026-04-21",
      "2026-04-27",
      "2026-04-30",
    ],
  },
  {
    tracker: "PKG-HOLLAND-PUGSLEE-260210",
    petId: PUGSLEE_PET_ID,
    petName: "Pugslee",
    expiresAt: "2026-06-10",
    sessions: [
      "2026-02-10",
      "2026-02-16",
      "2026-02-26",
      "2026-04-21",
      "2026-04-27",
      "2026-04-30",
      "2026-05-11",
    ],
  },
];

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross) {
  return round2(gross - gross / (1 + VAT_RATE));
}

async function findExistingTracker(tracker) {
  const { data, error } = await sb
    .from("invoices")
    .select("id, invoice_number")
    .eq("owner_id", OWNER_ID)
    .ilike("notes", `%tracker=${tracker}%`)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function ensurePackage(pkg) {
  const existing = await findExistingTracker(pkg.tracker);
  if (existing) {
    console.log(`Skip ${pkg.petName} — ${pkg.tracker} already exists (${existing.invoice_number})`);
    const { data: credit } = await sb
      .from("service_credits")
      .select("id, units_total, units_consumed")
      .eq("pet_id", pkg.petId)
      .eq("source_ref_id", existing.id)
      .maybeSingle();
    const { count } = await sb
      .from("daycare_sessions")
      .select("id", { count: "exact", head: true })
      .eq("package_id", credit?.id ?? "00000000-0000-0000-0000-000000000000");
    return { skipped: true, creditId: credit?.id, sessionCount: count ?? 0 };
  }

  const vatAed = vatFromGross(LUCKY7_AMOUNT);
  const paidAt = `${ISSUE_DATE}T10:00:00+04:00`;
  const notes = `Legacy daycare package purchase | tracker=${pkg.tracker} | raw_type=Lucky Seven | pet=${pkg.petName}`;

  const plan = {
    tracker: pkg.tracker,
    petName: pkg.petName,
    issueDate: ISSUE_DATE,
    amount: LUCKY7_AMOUNT,
    unitsTotal: 7,
    unitsConsumed: pkg.sessions.length,
    expiresAt: pkg.expiresAt,
    sessions: pkg.sessions,
    notes,
  };

  if (!APPLY) {
    return { skipped: false, plan };
  }

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .insert({
      owner_id: OWNER_ID,
      issue_date: ISSUE_DATE,
      due_date: ISSUE_DATE,
      status: "paid",
      subtotal: LUCKY7_AMOUNT,
      discount_amount: 0,
      discount_pct: 0,
      total: LUCKY7_AMOUNT,
      vat_aed: vatAed,
      payment_method: "card",
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
      staff_label: `${pkg.petName} — Lucky 7 Feb 10 2026`,
      created_at: paidAt,
    })
    .select("id")
    .single();
  if (pgErr) throw pgErr;

  const { error: liErr } = await sb.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: `Package: lucky_7 (7 sessions) — ${pkg.petName}`,
    quantity: 1,
    unit_price: LUCKY7_AMOUNT,
    total_price: LUCKY7_AMOUNT,
    line_total: LUCKY7_AMOUNT,
    service_type: "package",
    sort_order: 0,
    created_at: paidAt,
  });
  if (liErr) throw liErr;

  const { data: credit, error: scErr } = await sb
    .from("service_credits")
    .insert({
      pet_id: pkg.petId,
      service_code: "daycare_full_day",
      units_total: 7,
      units_consumed: pkg.sessions.length,
      expires_at: pkg.expiresAt,
      source_type: "package_purchase",
      source_ref_id: inv.id,
      purchase_group_id: pg.id,
      is_bonus: false,
      status: "active",
      created_at: paidAt,
    })
    .select("id")
    .single();
  if (scErr) throw scErr;

  for (let i = 0; i < pkg.sessions.length; i++) {
    const sessionDate = pkg.sessions[i];
    const slot = `U${i + 1}`;

    const { data: existingSession } = await sb
      .from("daycare_sessions")
      .select("id")
      .eq("pet_id", pkg.petId)
      .eq("package_id", credit.id)
      .eq("session_date", sessionDate)
      .maybeSingle();
    if (existingSession) continue;

    const { error: sessErr } = await sb.from("daycare_sessions").insert({
      owner_id: OWNER_ID,
      pet_id: pkg.petId,
      package_id: credit.id,
      session_date: sessionDate,
      checked_in: true,
      notes: `Legacy migration | tracker=${pkg.tracker} | slot=${slot}`,
      created_at: `${sessionDate}T08:00:00+04:00`,
    });
    if (sessErr) throw sessErr;
  }

  return {
    skipped: false,
    invoiceId: inv.id,
    creditId: credit.id,
    sessionCount: pkg.sessions.length,
  };
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");

  const results = [];
  for (const pkg of PACKAGES) {
    const result = await ensurePackage(pkg);
    results.push({ pet: pkg.petName, tracker: pkg.tracker, ...result });
  }

  console.log(JSON.stringify(results, null, 2));

  if (!APPLY) {
    console.log("\nRe-run with --apply to execute.");
    return;
  }

  console.log("\nVerification:");
  for (const pkg of PACKAGES) {
    const existing = await findExistingTracker(pkg.tracker);
    if (!existing) continue;

    const { data: credit } = await sb
      .from("service_credits")
      .select("id, units_total, units_consumed, expires_at, pets(name)")
      .eq("source_ref_id", existing.id)
      .single();

    const { data: sessions } = await sb
      .from("daycare_sessions")
      .select("session_date")
      .eq("package_id", credit.id)
      .order("session_date");

    console.log(
      `${pkg.petName}: ${credit.units_consumed}/${credit.units_total} used, expires ${credit.expires_at}`,
    );
    console.log(`  sessions: ${(sessions ?? []).map((s) => s.session_date).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
