// Startup-time guarantees on the agent's runtime contracts:
//   - the session storage bucket is reachable;
//   - agent_conversations has the columns we depend on (facts, owner_profile);
//   - the public schema still has every table/column the tools rely on.
// Failures here are fatal so production drift is impossible to ignore.

import { loadSchemaCache, assertSchemaExpectations } from "./schema-introspect.js";

async function assertColumnReadable(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (error) {
    throw new Error(`${table}.${column} is required: ${error.message}`);
  }
}

// Columns the agent's tools depend on. Mirrors the layout the tools assume
// when they build queries / inserts. If any are missing at boot we fail loud.
const SCHEMA_EXPECTATIONS = {
  owners: ["id", "first_name", "last_name", "phone", "member_type", "wallet_balance"],
  pets: ["id", "owner_id", "name", "species", "breed", "assessment_status", "size_category"],
  bookings: ["id", "owner_id", "room_id", "check_in_date", "check_out_date", "status", "booking_ref"],
  booking_pets: ["booking_id", "pet_id"],
  rooms: ["id", "display_name"],
  park_bookings: [
    "id", "booking_ref", "visit_date", "slot_start", "slot_end", "size_lane",
    "owner_id", "pet_id", "is_assessment", "price", "status",
  ],
};

export async function bootstrapAgentSchema(supabase, { sessionBucket }) {
  const { error: bucketErr } = await supabase.storage
    .from(sessionBucket)
    .list("", { limit: 1 });
  if (bucketErr) {
    throw new Error(`Cannot access Supabase storage bucket '${sessionBucket}': ${bucketErr.message}`);
  }

  await assertColumnReadable(supabase, "agent_conversations", "facts");
  await assertColumnReadable(supabase, "agent_conversations", "owner_profile");

  const schemaCache = await loadSchemaCache(supabase);
  assertSchemaExpectations(schemaCache, SCHEMA_EXPECTATIONS);
  console.log("Schema cache loaded:", {
    tables: schemaCache.allowedTables.size,
    rpcs: schemaCache.allowedRpcs.size,
    generated_at: schemaCache.generatedAt,
  });
  return { schemaCache };
}
