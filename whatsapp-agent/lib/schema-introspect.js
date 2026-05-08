// Schema introspection. Loaded once at boot via the agent_introspect()
// Postgres function and exposed to the rest of the agent as a single
// SchemaCache object:
//
//   {
//     tables: Map<string, Column[]>     // public.<table> -> columns
//     allowedTables: Set<string>        // tables the model may query
//     rpcs: Map<string, RpcMeta>        // public RPCs the model may call
//     allowedRpcs: Set<string>          // their names
//     reference: string                 // ready-to-inject prompt section
//     generatedAt: string
//   }
//
// Tools get the allow lists from here instead of hard-coding them, and
// runAgent injects `reference` into the system prompt so the model never
// has to guess a column name.

const TABLE_DENYLIST = new Set([
  "system_context",
  "system_settings",
  "audit_log",
  "staff_sessions",
]);

const TABLE_DENY_PREFIXES = ["agent_", "tenant_"];

const HIGHLIGHT_TABLES = new Set([
  "owners",
  "pets",
  "rooms",
  "bookings",
  "booking_pets",
  "booking_addons",
  "park_bookings",
  "park_rates",
  "daycare_sessions",
  "daycare_packages",
  "daycare_package_types",
  "vaccinations",
  "invoices",
  "wallet_transactions",
  "grooming_appointments",
  "boarding_rates",
  "grooming_package_rates",
  "addon_rates",
  "pricing",
]);

function isAllowedTable(name) {
  if (TABLE_DENYLIST.has(name)) return false;
  for (const prefix of TABLE_DENY_PREFIXES) {
    if (name.startsWith(prefix)) return false;
  }
  return true;
}

function summarizeColumns(cols, max = 18) {
  const items = (cols ?? []).slice(0, max).map((c) => c.name);
  if ((cols?.length ?? 0) > max) items.push(`…+${cols.length - max} more`);
  return items.join(", ");
}

export async function loadSchemaCache(supabase) {
  const { data, error } = await supabase.rpc("agent_introspect");
  if (error) {
    throw new Error(`agent_introspect RPC failed: ${error.message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("agent_introspect returned no payload");
  }

  const rawTables = data.tables ?? {};
  const tables = new Map();
  const allowedTables = new Set();
  for (const [name, cols] of Object.entries(rawTables)) {
    tables.set(name, cols);
    if (isAllowedTable(name)) allowedTables.add(name);
  }

  const rpcs = new Map();
  const allowedRpcs = new Set();
  for (const fn of data.rpcs ?? []) {
    rpcs.set(fn.name, fn);
    allowedRpcs.add(fn.name);
  }

  const referenceLines = ["SCHEMA REFERENCE (auto, do not invent columns):"];
  const sortedTables = [...tables.entries()].sort(([a], [b]) => {
    const aH = HIGHLIGHT_TABLES.has(a) ? 0 : 1;
    const bH = HIGHLIGHT_TABLES.has(b) ? 0 : 1;
    if (aH !== bH) return aH - bH;
    return a.localeCompare(b);
  });
  for (const [name, cols] of sortedTables) {
    if (!allowedTables.has(name)) continue;
    referenceLines.push(`- ${name}(${summarizeColumns(cols)})`);
  }
  if (rpcs.size) {
    referenceLines.push("RPCS:");
    for (const fn of rpcs.values()) {
      referenceLines.push(`- ${fn.name}(${fn.args}) -> ${fn.returns}`);
    }
  }

  return {
    tables,
    allowedTables,
    rpcs,
    allowedRpcs,
    reference: referenceLines.join("\n"),
    generatedAt: data.generated_at ?? new Date().toISOString(),
  };
}

// Boot-time drift guard. Each entry in `expectations` declares columns the
// runtime depends on. Throws if any are missing so we fail loudly at startup
// instead of silently misbehaving at turn time.
export function assertSchemaExpectations(cache, expectations) {
  const missing = [];
  for (const [table, columns] of Object.entries(expectations ?? {})) {
    const cols = cache.tables.get(table);
    if (!cols) {
      missing.push(`${table} (table absent)`);
      continue;
    }
    const present = new Set(cols.map((c) => c.name));
    for (const col of columns) {
      if (!present.has(col)) missing.push(`${table}.${col}`);
    }
  }
  if (missing.length) {
    throw new Error(
      "Schema drift: required columns missing -> " + missing.join(", "),
    );
  }
}
