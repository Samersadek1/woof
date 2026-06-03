/**
 * Dave/Naz Holland — Archie & Pugslee Lucky Seven packages
 *
 * Fixes:
 * - Split household 14-day credits → 7-day per-pet credits (Archie + Pugslee)
 * - Create missing Pugslee service_credits mirroring Archie's purchase groups
 * - Duplicate Archie daycare_sessions to Pugslee (same dates / package usage)
 * - Align units_consumed with actual session counts
 *
 * Usage:
 *   node scripts/fix-holland-archie-pugslee-packages.mjs          # dry-run
 *   node scripts/fix-holland-archie-pugslee-packages.mjs --apply
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

const OWNER_ID = "060f64ed-7fa9-4c6b-a874-3b6da745d31e";
const ARCHIE_PET_ID = "368ce806-8313-4de1-bb89-fd734902bc93";
const PUGSLEE_PET_ID = "b6fcc0ff-4352-49ed-9bf2-05bdd6f2793d";

/** Archie credits keyed by tracker id */
const ARCHIE_CREDITS = [
  {
    id: "333b60ea-1626-4963-b454-cc415b826d07",
    tracker: "PKG-93125",
    purchaseGroupId: "6667b29a-0ceb-49cd-a5b4-3ad082c7db0e",
  },
  {
    id: "fdd347ec-dc49-4ee6-9872-d94bddb20176",
    tracker: "PKG-87882",
    purchaseGroupId: "79a0e3e1-15bd-4b5d-979e-78717bb82617",
  },
  {
    id: "a633602d-6cea-4253-9f19-e8742bbe5e05",
    tracker: "PKG-86978",
    purchaseGroupId: "be666d6d-bb3e-4d4f-988e-309a3d868f06",
  },
  {
    id: "79068f10-fc4a-4eb3-bd09-c662bb381f46",
    tracker: "PKG-88917",
    purchaseGroupId: "d74ff793-7191-46b3-8620-e6c612247762",
  },
];

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function loadArchieSessions(archieCreditId) {
  const { data, error } = await sb
    .from("daycare_sessions")
    .select("*")
    .eq("package_id", archieCreditId)
    .eq("pet_id", ARCHIE_PET_ID)
    .order("session_date")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const plan = [];

  for (const credit of ARCHIE_CREDITS) {
    const { data: archieRow, error: creditErr } = await sb
      .from("service_credits")
      .select("*")
      .eq("id", credit.id)
      .single();
    if (creditErr) throw creditErr;

    const sessions = await loadArchieSessions(credit.id);
    const consumed = sessions.length;

    const { data: existingPugslee } = await sb
      .from("service_credits")
      .select("id")
      .eq("pet_id", PUGSLEE_PET_ID)
      .eq("purchase_group_id", credit.purchaseGroupId)
      .maybeSingle();

    plan.push({
      tracker: credit.tracker,
      archieCreditId: credit.id,
      purchaseGroupId: credit.purchaseGroupId,
      archie: {
        units_total: 7,
        units_consumed: consumed,
        expires_at: archieRow.expires_at,
      },
      pugslee: {
        creditId: existingPugslee?.id ?? "(new)",
        units_total: 7,
        units_consumed: consumed,
        expires_at: archieRow.expires_at,
      },
      sessionsToClone: sessions.map((s) => ({
        id: s.id,
        session_date: s.session_date,
        checked_in: s.checked_in,
      })),
    });
  }

  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");
  console.log(JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nRe-run with --apply to execute.");
    return;
  }

  for (const item of plan) {
    const creditMeta = ARCHIE_CREDITS.find((c) => c.tracker === item.tracker);
    const archieRow = (
      await sb.from("service_credits").select("*").eq("id", creditMeta.id).single()
    ).data;

    // 1) Normalize Archie credit to 7-day cap
    const { error: archieUpdErr } = await sb
      .from("service_credits")
      .update({
        units_total: 7,
        units_consumed: item.archie.units_consumed,
      })
      .eq("id", creditMeta.id);
    if (archieUpdErr) throw archieUpdErr;

    // 2) Upsert Pugslee credit on same purchase group
    let pugsleeCreditId = item.pugslee.creditId;
    if (pugsleeCreditId === "(new)") {
      const { data: inserted, error: insErr } = await sb
        .from("service_credits")
        .insert({
          pet_id: PUGSLEE_PET_ID,
          service_code: archieRow.service_code,
          units_total: 7,
          units_consumed: item.pugslee.units_consumed,
          expires_at: archieRow.expires_at,
          source_type: archieRow.source_type,
          source_ref_id: archieRow.source_ref_id,
          purchase_group_id: creditMeta.purchaseGroupId,
          redemption_group_id: archieRow.redemption_group_id,
          is_bonus: archieRow.is_bonus,
          status: archieRow.status,
          created_at: archieRow.created_at,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      pugsleeCreditId = inserted.id;
    } else {
      const { error: pugUpdErr } = await sb
        .from("service_credits")
        .update({
          units_total: 7,
          units_consumed: item.pugslee.units_consumed,
          expires_at: archieRow.expires_at,
        })
        .eq("id", pugsleeCreditId);
      if (pugUpdErr) throw pugUpdErr;
    }

    // 3) Clone Archie sessions → Pugslee (skip if already present for same date + package)
    const archieSessions = await loadArchieSessions(creditMeta.id);
    for (const session of archieSessions) {
      const { data: existing } = await sb
        .from("daycare_sessions")
        .select("id")
        .eq("pet_id", PUGSLEE_PET_ID)
        .eq("package_id", pugsleeCreditId)
        .eq("session_date", session.session_date)
        .eq("notes", session.notes)
        .maybeSingle();

      if (existing) continue;

      const { error: cloneErr } = await sb.from("daycare_sessions").insert({
        owner_id: OWNER_ID,
        pet_id: PUGSLEE_PET_ID,
        package_id: pugsleeCreditId,
        session_date: session.session_date,
        checked_in: session.checked_in,
        checked_in_at: session.checked_in_at,
        checked_out_at: session.checked_out_at,
        notes: session.notes,
        pickup_used: session.pickup_used,
        dropoff_used: session.dropoff_used,
        logged_by: session.logged_by,
        remark: session.remark,
        staff_id: session.staff_id,
        created_at: session.created_at,
      });
      if (cloneErr) throw cloneErr;
    }

    // 4) Mark purchase group as 2-dog
    const { error: pgErr } = await sb
      .from("purchase_groups")
      .update({ pet_count: 2 })
      .eq("id", creditMeta.purchaseGroupId);
    if (pgErr) throw pgErr;
  }

  console.log("\nDone. Verification:");

  const { data: verifyCredits } = await sb
    .from("service_credits")
    .select(
      "id, pet_id, units_total, units_consumed, expires_at, purchase_group_id, pets(name), purchase_groups(invoices(notes))",
    )
    .in(
      "purchase_group_id",
      ARCHIE_CREDITS.map((c) => c.purchaseGroupId),
    )
    .order("purchase_group_id")
    .order("pet_id");

  console.log(JSON.stringify(verifyCredits, null, 2));

  for (const credit of ARCHIE_CREDITS) {
    const archieCount = (
      await sb
        .from("daycare_sessions")
        .select("id", { count: "exact", head: true })
        .eq("package_id", credit.id)
        .eq("pet_id", ARCHIE_PET_ID)
    ).count;

    const { data: pugCredit } = await sb
      .from("service_credits")
      .select("id")
      .eq("pet_id", PUGSLEE_PET_ID)
      .eq("purchase_group_id", credit.purchaseGroupId)
      .single();

    const pugsleeCount = (
      await sb
        .from("daycare_sessions")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pugCredit.id)
        .eq("pet_id", PUGSLEE_PET_ID)
    ).count;

    console.log(
      `${credit.tracker}: Archie ${archieCount} sessions, Pugslee ${pugsleeCount} sessions`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
