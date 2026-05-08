#!/usr/bin/env node
// Audit the agent_capability_gaps view: surface schema drift, missing write
// tools, and capability-denied replies the bot is producing in production.
// Run on a schedule or ad-hoc to discover where the agent's tool catalog
// lags behind real owner intent.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_KEY=... node scripts/audit-capabilities.mjs [--days 7] [--limit 25]

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const envPath = resolve(here, "..", "..", ".env");
try {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch {
  // .env is optional when env vars are already set.
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.");
  process.exit(1);
}

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const days = Number(args.get("days") ?? 7);
const limit = Number(args.get("limit") ?? 25);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const { data: rows, error } = await supabase
  .from("agent_capability_gaps")
  .select("started_at, gap_type, chat_id, message_in, tool_trace, blocked_reason")
  .gte("started_at", since)
  .order("started_at", { ascending: false })
  .limit(limit);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(2);
}

const counts = new Map();
for (const r of rows ?? []) {
  counts.set(r.gap_type, (counts.get(r.gap_type) ?? 0) + 1);
}

console.log(`\nCapability gaps in last ${days} day(s):`);
if (!rows?.length) {
  console.log("  (none)");
} else {
  for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
  console.log("\nMost recent samples:");
  for (const r of rows.slice(0, 10)) {
    const ts = new Date(r.started_at).toISOString().slice(0, 19).replace("T", " ");
    console.log(`  [${ts}] ${r.gap_type}`);
    console.log(`    chat: ${r.chat_id}`);
    console.log(`    msg : ${(r.message_in ?? "").slice(0, 90)}`);
    console.log(`    tool: ${(r.tool_trace ?? "").slice(0, 90)}`);
    if (r.blocked_reason) console.log(`    blk : ${r.blocked_reason}`);
  }
}
