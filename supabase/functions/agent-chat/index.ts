import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = Deno.env.get("AGENT_CHAT_MODEL") ?? "claude-sonnet-4-20250514";
const LOW_COMPLEXITY_MODEL = Deno.env.get("AGENT_CHAT_LOW_COMPLEXITY_MODEL") ?? "";
const MAX_TOK = Number(Deno.env.get("AGENT_CHAT_MAX_TOKENS") ?? "4096");
const DEFAULT_QUERY_LIMIT = Number(Deno.env.get("AGENT_CHAT_QUERY_DEFAULT_LIMIT") ?? "25");
const MAX_QUERY_LIMIT = Number(Deno.env.get("AGENT_CHAT_QUERY_MAX_LIMIT") ?? "120");
const MAX_TOOL_ROUNDS = Number(Deno.env.get("AGENT_CHAT_MAX_TOOL_ROUNDS") ?? "3");
const CONTEXT_MAX_CHARS = Number(Deno.env.get("AGENT_CHAT_CONTEXT_MAX_CHARS") ?? "24000");
const SCHEMA_MAX_CHARS = Number(Deno.env.get("AGENT_CHAT_SCHEMA_MAX_CHARS") ?? "14000");
const GUIDELINES_MAX_CHARS = Number(Deno.env.get("AGENT_CHAT_GUIDELINES_MAX_CHARS") ?? "5000");
const RULES_MAX_CHARS = Number(Deno.env.get("AGENT_CHAT_RULES_MAX_CHARS") ?? "7000");
const TOOL_RESULT_MAX_CHARS = Number(Deno.env.get("AGENT_CHAT_TOOL_RESULT_MAX_CHARS") ?? "6000");
const TOOL_RESULT_PREVIEW_ROWS = Number(
  Deno.env.get("AGENT_CHAT_TOOL_RESULT_PREVIEW_ROWS") ?? "20",
);
const SNAPSHOT_TTL_MS = Number(Deno.env.get("AGENT_CHAT_SNAPSHOT_TTL_MS") ?? "30000");
const SNAPSHOT_EVERY_USER_TURNS = Number(
  Deno.env.get("AGENT_CHAT_SNAPSHOT_EVERY_USER_TURNS") ?? "3",
);
const ENABLE_FAST_SNAPSHOT = Deno.env.get("AGENT_CHAT_ENABLE_FAST_SNAPSHOT") !== "false";
const HOUR_MS = 60 * 60 * 1000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const e = _cache.get(key);
  if (!e || Date.now() > e.expiresAt) return null;
  return e.value;
}

function setCached(key: string, value: string): void {
  _cache.set(key, { value, expiresAt: Date.now() + HOUR_MS });
}

function setCachedWithTtl(key: string, value: string, ttlMs: number): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function trimByChars(label: string, value: string, maxChars: number): string {
  if (maxChars <= 0 || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[${label} truncated for speed]`;
}

function estimateComplexity(message: string): "low" | "normal" {
  const text = message.trim().toLowerCase();
  if (!text) return "normal";
  const words = text.split(/\s+/).length;
  const trivial = /^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(text);
  const analytical = /(count|list|show|today|booking|invoice|owner|pet|room|status|check)/.test(text);
  if ((trivial || words <= 8) && !analytical) return "low";
  return "normal";
}

function selectModel(message: string): string {
  if (LOW_COMPLEXITY_MODEL && estimateComplexity(message) === "low") {
    return LOW_COMPLEXITY_MODEL;
  }
  return DEFAULT_MODEL;
}

function serializeToolResult(result: unknown): string {
  const safePreview = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return {
        row_count: value.length,
        rows: value.slice(0, Math.max(1, TOOL_RESULT_PREVIEW_ROWS)),
        truncated: value.length > TOOL_RESULT_PREVIEW_ROWS,
      };
    }
    if (value && typeof value === "object" && "rows" in (value as Record<string, unknown>)) {
      const obj = value as Record<string, unknown>;
      const rows = Array.isArray(obj.rows) ? obj.rows : [];
      return {
        ...obj,
        rows: rows.slice(0, Math.max(1, TOOL_RESULT_PREVIEW_ROWS)),
        truncated: rows.length > TOOL_RESULT_PREVIEW_ROWS || Boolean(obj.truncated),
      };
    }
    return value;
  };

  const raw = JSON.stringify(result);
  if (raw.length <= TOOL_RESULT_MAX_CHARS) return raw;

  const compact = JSON.stringify(safePreview(result));
  if (compact.length <= TOOL_RESULT_MAX_CHARS) return compact;

  return JSON.stringify({
    truncated: true,
    summary: "Tool output exceeded limit and was compacted for speed.",
    preview: compact.slice(0, Math.max(200, TOOL_RESULT_MAX_CHARS - 200)),
  });
}

type SupabaseClient = ReturnType<typeof createClient>;

async function getBusinessRules(svc: SupabaseClient): Promise<string> {
  const cacheKey = "business_rules";
  const hit = getCached(cacheKey);
  if (hit) return hit;

  const { data, error } = await svc
    .from("system_context")
    .select("content")
    .eq("key", "business_rules")
    .single();

  if (error || !data) return "";
  const content = (data.content as string | null) ?? "";
  setCached(cacheKey, content);
  return content;
}

async function getQueryGuidelines(svc: SupabaseClient): Promise<string> {
  const cacheKey = "query_guidelines";
  const hit = getCached(cacheKey);
  if (hit) return hit;

  const { data, error } = await svc
    .from("system_context")
    .select("content")
    .eq("key", "query_guidelines")
    .single();

  if (error || !data) return "";
  const content = (data.content as string | null) ?? "";
  setCached(cacheKey, content);
  return content;
}

async function getWriteGuidelines(svc: SupabaseClient): Promise<string> {
  const cacheKey = "write_guidelines";
  const hit = getCached(cacheKey);
  if (hit) return hit;

  const { data, error } = await svc
    .from("system_context")
    .select("content")
    .eq("key", "write_guidelines")
    .single();

  if (error || !data) return "";
  const content = (data.content as string | null) ?? "";
  setCached(cacheKey, content);
  return content;
}

async function getSchemaContext(svc: SupabaseClient): Promise<string> {
  const cacheKey = "schema";
  const hit = getCached(cacheKey);
  if (hit) return hit;

  try {
    const [{ data: columns, error: colErr }, { data: enums, error: enumErr }] =
      await Promise.all([
        svc.from("msh_schema_view").select("*"),
        svc.from("msh_enum_view").select("*"),
      ]);

    if (colErr || enumErr) return "";

    const byTable = new Map<string, Array<{ column_name: string; data_type: string }>>();
    for (const row of (columns ?? []) as Array<Record<string, unknown>>) {
      const tableName = String(row.table_name ?? "");
      if (!tableName) continue;
      const existing = byTable.get(tableName) ?? [];
      existing.push({
        column_name: String(row.column_name ?? ""),
        data_type: String(row.data_type ?? ""),
      });
      byTable.set(tableName, existing);
    }

    const schemaText = Array.from(byTable.entries())
      .map(([tableName, rows]) => {
        const cols = rows
          .map((r) => `  - ${r.column_name} (${r.data_type})`)
          .join("\n");
        return `TABLE ${tableName}:\n${cols}`;
      })
      .join("\n\n");

    const byEnum = new Map<string, string[]>();
    for (const row of (enums ?? []) as Array<Record<string, unknown>>) {
      const enumName = String(row.enum_name ?? "");
      if (!enumName) continue;
      const existing = byEnum.get(enumName) ?? [];
      existing.push(String(row.enum_value ?? ""));
      byEnum.set(enumName, existing);
    }

    const enumText = Array.from(byEnum.entries())
      .map(([enumName, values]) => `ENUM ${enumName}: ${values.join(", ")}`)
      .join("\n");

    const combined = `${schemaText}\n\n${enumText}`;
    setCached(cacheKey, combined);
    return combined;
  } catch {
    return "";
  }
}

async function getTodaySnapshot(svc: SupabaseClient, today: string): Promise<string> {
  const cacheKey = `today_snapshot:${today}`;
  const hit = getCached(cacheKey);
  if (hit) return hit;

  const results = await Promise.allSettled([
    svc
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "checked_in"),
    svc
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_in_date", today)
      .in("status", ["confirmed", "checked_in"]),
    svc
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_out_date", today)
      .eq("status", "checked_in"),
    svc
      .from("daycare_sessions")
      .select("*", { count: "exact", head: true })
      .eq("session_date", today),
    svc
      .from("park_bookings")
      .select("*", { count: "exact", head: true })
      .eq("visit_date", today),
    svc
      .from("grooming_appointments")
      .select("*", { count: "exact", head: true })
      .eq("appointment_date", today),
  ]);

  const counts = results.map((r) => {
    if (r.status !== "fulfilled") return 0;
    return r.value.count ?? 0;
  });

  const snapshot = `=== TODAY AT MSH (${today}) ===
Currently in house: ${counts[0]}
Arriving today:     ${counts[1]}
Departing today:    ${counts[2]}
Daycare sessions:   ${counts[3]}
Park bookings:      ${counts[4]}
Grooming:           ${counts[5]}`;
  setCachedWithTtl(cacheKey, snapshot, SNAPSHOT_TTL_MS);
  return snapshot;
}

async function buildSystemPrompt(
  svc: SupabaseClient,
  today: string,
  options?: { includeSnapshot?: boolean },
): Promise<string> {
  const includeSnapshot = options?.includeSnapshot ?? true;
  const [rules, queryGuide, writeGuide, schema, snapshot] =
    await Promise.all([
      getBusinessRules(svc),
      getQueryGuidelines(svc),
      getWriteGuidelines(svc),
      getSchemaContext(svc),
      includeSnapshot ? getTodaySnapshot(svc, today) : Promise.resolve(""),
    ]);

  const safeRules = trimByChars("Business rules", rules, RULES_MAX_CHARS);
  const safeSchema = trimByChars("Database schema", schema, SCHEMA_MAX_CHARS);
  const safeQueryGuide = trimByChars("Query guidelines", queryGuide, GUIDELINES_MAX_CHARS);
  const safeWriteGuide = trimByChars("Write guidelines", writeGuide, GUIDELINES_MAX_CHARS);
  const safeSnapshot = includeSnapshot
    ? trimByChars("Today snapshot", snapshot, Math.max(300, GUIDELINES_MAX_CHARS))
    : "";

  const prompt = `You are an AI assistant for MySecondHome (MSH), a premium pet
boarding facility in Dubai. You help staff manage operations
using plain English.

You have tools to query the database, call RPCs, and take actions.
Always use your tools when you need data — never make up figures
or claim you do not have access. You have full access to the MSH
Supabase database via your tools.

Answer in plain conversational English. Never show raw JSON,
code fences, or query syntax to staff.

Use tools only when needed. For greetings, acknowledgements, and
simple conversational replies that do not require live data, reply
directly without calling tools.

Prefer one focused query over many broad queries. Keep tool calls
minimal, and summarize results instead of repeating entire datasets.

=== BUSINESS RULES ===
${safeRules}

=== DATABASE SCHEMA ===
${safeSchema}

=== QUERY GUIDELINES ===
${safeQueryGuide}

=== WRITE GUIDELINES ===
${safeWriteGuide}

${safeSnapshot}

Today's date: ${today}`;
  return trimByChars("System prompt", prompt, CONTEXT_MAX_CHARS);
}

const MSH_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_database",
    description: `Query any MSH Supabase table. Supports PostgREST
      nested selects for joining related tables. Use this for ALL
      data lookups. Never claim you lack access — use this tool.`,
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        select: {
          type: "string",
          description: "Columns to return. Supports nested: rooms(wing,name)",
        },
        filter: {
          type: "object",
          description: "Equality, array (IN), or operator filters",
        },
        limit: {
          type: "number",
          description: "Max rows returned. Default 25, max 120.",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "call_rpc",
    description: `Call a Supabase RPC function. Available:
      is_off_peak(check_date) → boolean
      resolve_boarding_rate(category, size_tier, season) → numeric
      tier_discount_pct(member_type) → numeric (0/10/20/30)
      resolve_line_total(booking_id) → numeric`,
    input_schema: {
      type: "object",
      properties: {
        function_name: { type: "string" },
        params: { type: "object" },
      },
      required: ["function_name"],
    },
  },
  {
    name: "create_draft_booking",
    description: `Create a DRAFT booking requiring staff confirmation.
      Always verify availability and price first. Show full summary
      to staff and get explicit confirmation before calling.
      Never create with status confirmed directly.`,
    input_schema: {
      type: "object",
      properties: {
        owner_id: { type: "string" },
        pet_ids: { type: "array", items: { type: "string" } },
        room_id: { type: "string" },
        check_in_date: { type: "string", description: "YYYY-MM-DD" },
        check_out_date: { type: "string", description: "YYYY-MM-DD" },
        add_ons: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        created_by_name: { type: "string" },
      },
      required: ["owner_id", "pet_ids", "room_id", "check_in_date", "check_out_date"],
    },
  },
  {
    name: "update_booking_status",
    description: `Change booking status. Allowed transitions:
      draft→confirmed, draft→cancelled,
      confirmed→checked_in, confirmed→cancelled,
      checked_in→checked_out.
      Cancellations require a reason. Always confirm with staff first.`,
    input_schema: {
      type: "object",
      properties: {
        booking_id: { type: "string" },
        new_status: {
          type: "string",
          enum: ["confirmed", "checked_in", "checked_out", "cancelled"],
        },
        reason: { type: "string" },
      },
      required: ["booking_id", "new_status"],
    },
  },
  {
    name: "log_note",
    description: `Append a timestamped note to a pet or booking.
      ALWAYS appends — never overwrites existing notes.
      Read the note back to staff before saving.`,
    input_schema: {
      type: "object",
      properties: {
        target_type: { type: "string", enum: ["pet", "booking"] },
        target_id: { type: "string" },
        note: { type: "string" },
        note_field: {
          type: "string",
          enum: ["behavioural_notes", "feeding_notes", "medical_notes", "agent_notes"],
        },
      },
      required: ["target_type", "target_id", "note", "note_field"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  svc: ReturnType<typeof createClient>,
): Promise<unknown> {
  try {
    switch (name) {
      case "query_database": {
        const ALLOWED = new Set([
          "bookings",
          "booking_pets",
          "pets",
          "owners",
          "rooms",
          "daycare_sessions",
          "daycare_packages",
          "park_bookings",
          "vaccinations",
          "invoices",
          "invoice_line_items",
          "wallet_transactions",
          "grooming_appointments",
          "boarding_rates",
          "grooming_package_rates",
          "addon_rates",
          "pricing",
          "agent_conversations",
          "staff_sessions",
        ]);

        const table = input.table as string;
        const select = (input.select as string | undefined) ?? "*";
        const filter = (input.filter as Record<string, unknown> | undefined) ?? {};
        const requestedLimit = (input.limit as number | undefined) ?? DEFAULT_QUERY_LIMIT;
        const limit = Math.min(Math.max(1, requestedLimit), MAX_QUERY_LIMIT);

        if (!ALLOWED.has(table)) {
          return { error: `Table not allowed: ${table}` };
        }

        let q = svc.from(table).select(select).limit(limit);

        for (const [col, val] of Object.entries(filter)) {
          if (val === undefined) continue;
          if (Array.isArray(val)) {
            q = q.in(col, val);
          } else if (val !== null && typeof val === "object") {
            const ops = val as Record<string, unknown>;
            if (ops.eq !== undefined) q = q.eq(col, ops.eq);
            if (ops.neq !== undefined) q = q.neq(col, ops.neq);
            if (ops.lt !== undefined) q = q.lt(col, ops.lt);
            if (ops.lte !== undefined) q = q.lte(col, ops.lte);
            if (ops.gt !== undefined) q = q.gt(col, ops.gt);
            if (ops.gte !== undefined) q = q.gte(col, ops.gte);
          } else {
            q = q.eq(col, val);
          }
        }

        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = Array.isArray(data) ? data : [];
        return {
          row_count: rows.length,
          rows: rows.slice(0, Math.max(1, TOOL_RESULT_PREVIEW_ROWS)),
          truncated: rows.length > TOOL_RESULT_PREVIEW_ROWS,
          requested_limit: requestedLimit,
          applied_limit: limit,
        };
      }

      case "call_rpc": {
        const ALLOWED_RPC = new Set([
          "is_off_peak",
          "resolve_boarding_rate",
          "tier_discount_pct",
          "resolve_line_total",
          "generate_booking_ref",
        ]);

        const fn = input.function_name as string;
        const params = (input.params as Record<string, unknown> | undefined) ?? {};

        if (!ALLOWED_RPC.has(fn)) {
          return { error: `RPC not allowed: ${fn}` };
        }

        const { data, error } = await svc.rpc(fn, params);
        if (error) return { error: error.message };
        return data;
      }

      case "create_draft_booking": {
        const {
          owner_id,
          pet_ids,
          room_id,
          check_in_date,
          check_out_date,
          add_ons,
          notes,
          created_by_name,
        } = input as {
          owner_id: string;
          pet_ids: string[];
          room_id: string;
          check_in_date: string;
          check_out_date: string;
          add_ons?: string[];
          notes?: string;
          created_by_name?: string;
        };

        if (!Array.isArray(pet_ids) || pet_ids.length === 0) {
          return { error: "pet_ids must be a non-empty array" };
        }

        const { data: ref, error: refErr } = await svc.rpc("generate_booking_ref");
        if (refErr || !ref) return { error: "Could not generate booking ref" };

        const { data: booking, error: bErr } = await svc
          .from("bookings")
          .insert({
            booking_ref: ref,
            owner_id,
            room_id,
            check_in_date,
            check_out_date,
            status: "draft",
            notes: notes ?? null,
            created_by: created_by_name ?? "AI assistant",
            add_ons: add_ons ?? [],
          })
          .select("id, booking_ref, status, check_in_date, check_out_date")
          .single();

        if (bErr || !booking) return { error: bErr?.message ?? "Insert failed" };

        const { error: pErr } = await svc
          .from("booking_pets")
          .insert(pet_ids.map((pet_id) => ({ booking_id: booking.id, pet_id })));

        if (pErr) {
          await svc.from("bookings").delete().eq("id", booking.id);
          return { error: "Pet linking failed: " + pErr.message };
        }

        return {
          success: true,
          booking_id: booking.id,
          booking_ref: booking.booking_ref,
          status: "draft",
          check_in: booking.check_in_date,
          check_out: booking.check_out_date,
          pets_linked: pet_ids.length,
          message: `Draft ${ref} created. Use update_booking_status to confirm.`,
        };
      }

      case "update_booking_status": {
        const { booking_id, new_status, reason } = input as {
          booking_id: string;
          new_status: string;
          reason?: string;
        };

        const TRANSITIONS: Record<string, string[]> = {
          draft: ["confirmed", "cancelled"],
          confirmed: ["checked_in", "cancelled"],
          checked_in: ["checked_out"],
        };

        const { data: cur, error: fErr } = await svc
          .from("bookings")
          .select("id, status, booking_ref")
          .eq("id", booking_id)
          .single();

        if (fErr || !cur) return { error: "Booking not found" };

        const allowed = TRANSITIONS[cur.status] ?? [];
        if (!allowed.includes(new_status)) {
          return {
            error: `Cannot go from '${cur.status}' to '${new_status}'. ` +
              `Allowed: ${allowed.length ? allowed.join(", ") : "none"}`,
          };
        }

        if (new_status === "cancelled" && !reason) {
          return { error: "reason is required when cancelling" };
        }

        const payload: Record<string, unknown> = { status: new_status };
        if (new_status === "checked_in") {
          payload.actual_check_in_at = new Date().toISOString();
        }
        if (new_status === "checked_out") {
          payload.actual_check_out_at = new Date().toISOString();
        }
        if (new_status === "cancelled") {
          payload.cancelled_reason = reason ?? null;
        }

        const { error: uErr } = await svc
          .from("bookings")
          .update(payload)
          .eq("id", booking_id);

        if (uErr) return { error: uErr.message };

        return {
          success: true,
          booking_ref: cur.booking_ref,
          old_status: cur.status,
          new_status,
          message: `${cur.booking_ref} → ${new_status}`,
        };
      }

      case "log_note": {
        const { target_type, target_id, note, note_field } = input as {
          target_type: "pet" | "booking";
          target_id: string;
          note: string;
          note_field: string;
        };

        const PET_FIELDS = ["behavioural_notes", "feeding_notes", "medical_notes"];
        const BOOKING_FIELDS = ["agent_notes"];

        if (target_type === "pet" && !PET_FIELDS.includes(note_field)) {
          return {
            error: `note_field for pet must be one of: ${PET_FIELDS.join(", ")}`,
          };
        }
        if (target_type === "booking" && !BOOKING_FIELDS.includes(note_field)) {
          return {
            error: `note_field for booking must be: ${BOOKING_FIELDS.join(", ")}`,
          };
        }

        const table = target_type === "pet" ? "pets" : "bookings";
        const { data: row, error: fErr } = await svc
          .from(table)
          .select(`id, ${note_field}`)
          .eq("id", target_id)
          .single();

        if (fErr || !row) return { error: `${target_type} not found` };

        const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
        const existing = (row[note_field] as string | null) ?? "";
        const sep = existing.trim() ? "\n" : "";
        const updated = `${existing}${sep}[${ts}] ${note}`;

        const { error: uErr } = await svc
          .from(table)
          .update({ [note_field]: updated })
          .eq("id", target_id);

        if (uErr) return { error: uErr.message };

        return {
          success: true,
          appended: note,
          message: `Note saved to ${target_type} ${note_field} at ${ts}`,
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { error: String(error) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID().slice(0, 8);
    const perf = {
      request_id: requestId,
      model: DEFAULT_MODEL,
      auth_ms: 0,
      session_ms: 0,
      prompt_ms: 0,
      save_ms: 0,
      total_ms: 0,
      claude_rounds: 0,
      claude_ms: [] as number[],
      tool_rounds: 0,
      tool_calls: 0,
      tool_ms: [] as number[],
      tool_payload_chars: 0,
      prompt_chars: 0,
      final_chars: 0,
      used_snapshot: false,
      max_tool_rounds_reached: false,
      history_messages: 0,
    };

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";

    const userSvc = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const authStarted = Date.now();
    const { data: { user }, error: authErr } = await userSvc.auth.getUser();
    perf.auth_ms = Date.now() - authStarted;
    if (authErr || !user) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }

    const { session_id, message } = await req.json() as {
      session_id: string | null;
      message: string;
    };

    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    let currentSessionId: string = session_id ?? "";
    let history: Array<{ role: string; content: unknown }> = [];
    let isNew = false;

    const sessionStarted = Date.now();
    if (currentSessionId) {
      const { data: sess } = await svc
        .from("staff_sessions")
        .select("history")
        .eq("id", currentSessionId)
        .eq("staff_id", user.id)
        .single();

      if (sess) {
        history = (sess.history as typeof history) ?? [];
      } else {
        currentSessionId = "";
      }
    }

    if (!currentSessionId) {
      const { data: newSess, error: newErr } = await svc
        .from("staff_sessions")
        .insert({ staff_id: user.id, title: "New conversation", history: [] })
        .select("id")
        .single();

      if (newErr || !newSess) {
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      currentSessionId = newSess.id;
      isNew = true;
    }
    perf.session_ms = Date.now() - sessionStarted;

    const incoming = { role: "user" as const, content: message };
    const claudeMessages = [...history, incoming];
    perf.history_messages = history.length;

    const today = new Date().toISOString().split("T")[0];
    const priorUserTurns = history.filter((m) => m.role === "user").length;
    const timeSensitive = /(today|now|current|checked in|arriving|departing)/i.test(message);
    const includeSnapshot = !ENABLE_FAST_SNAPSHOT ||
      timeSensitive ||
      priorUserTurns % Math.max(1, SNAPSHOT_EVERY_USER_TURNS) === 0;
    perf.used_snapshot = includeSnapshot;

    const promptStarted = Date.now();
    const systemPrompt = await buildSystemPrompt(svc, today, { includeSnapshot });
    perf.prompt_ms = Date.now() - promptStarted;
    perf.prompt_chars = systemPrompt.length;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    let currentMessages = [...claudeMessages];
    let finalText = "";
    const selectedModel = selectModel(message);
    perf.model = selectedModel;
    let toolRounds = 0;

    while (true) {
      const roundStarted = Date.now();
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: MAX_TOK,
        system: systemPrompt,
        tools: MSH_TOOLS,
        messages: currentMessages as Anthropic.MessageParam[],
      });
      perf.claude_rounds += 1;
      perf.claude_ms.push(Date.now() - roundStarted);

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        if (toolRounds >= Math.max(1, MAX_TOOL_ROUNDS)) {
          perf.max_tool_rounds_reached = true;
          finalText =
            "I have enough context to help, but this request needs too many back-and-forth data calls. Please narrow the question or ask for one specific outcome.";
          break;
        }

        const toolBlocks = response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (!toolBlocks.length) {
          finalText = "I couldn't run tools for this request. Please try again.";
          break;
        }

        toolRounds += 1;
        perf.tool_rounds = toolRounds;
        perf.tool_calls += toolBlocks.length;

        const toolResults = await Promise.all(
          toolBlocks.map(async (block) => {
            const toolStarted = Date.now();
            const rawResult = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              svc,
            );
            perf.tool_ms.push(Date.now() - toolStarted);
            const serialized = serializeToolResult(rawResult);
            perf.tool_payload_chars += serialized.length;
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: serialized,
            };
          }),
        );

        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: toolResults },
        ];
        continue;
      }

      finalText = "Something went wrong. Please try again.";
      break;
    }

    const outgoing = { role: "assistant" as const, content: finalText };
    const updatedHistory = [...claudeMessages, outgoing];

    const autoTitle = isNew
      ? message.slice(0, 60).trim() + (message.length > 60 ? "…" : "")
      : null;

    const saveStarted = Date.now();
    await svc
      .from("staff_sessions")
      .update({
        history: updatedHistory,
        ...(autoTitle ? { title: autoTitle } : {}),
      })
      .eq("id", currentSessionId);
    perf.save_ms = Date.now() - saveStarted;
    perf.final_chars = finalText.length;
    perf.total_ms = Date.now() - startedAt;
    console.log("agent-chat perf", perf);

    return new Response(
      JSON.stringify({
        text: finalText,
        session_id: currentSessionId,
        title: autoTitle ?? undefined,
        meta: {
          request_id: requestId,
          progress_stage: "finalizing",
          total_ms: perf.total_ms,
          claude_rounds: perf.claude_rounds,
          tool_rounds: perf.tool_rounds,
          used_snapshot: perf.used_snapshot,
        },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("agent-chat error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
