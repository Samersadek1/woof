import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOK = 4096;
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

  return `=== TODAY AT MSH (${today}) ===
Currently in house: ${counts[0]}
Arriving today:     ${counts[1]}
Departing today:    ${counts[2]}
Daycare sessions:   ${counts[3]}
Park bookings:      ${counts[4]}
Grooming:           ${counts[5]}`;
}

async function buildSystemPrompt(
  svc: SupabaseClient,
  today: string,
): Promise<string> {
  const [rules, queryGuide, writeGuide, schema, snapshot] =
    await Promise.all([
      getBusinessRules(svc),
      getQueryGuidelines(svc),
      getWriteGuidelines(svc),
      getSchemaContext(svc),
      getTodaySnapshot(svc, today),
    ]);

  return `You are an AI assistant for MySecondHome (MSH), a premium pet
boarding facility in Dubai. You help staff manage operations
using plain English.

You have tools to query the database, call RPCs, and take actions.
Always use your tools when you need data — never make up figures
or claim you do not have access. You have full access to the MSH
Supabase database via your tools.

Answer in plain conversational English. Never show raw JSON,
code fences, or query syntax to staff.

=== BUSINESS RULES ===
${rules}

=== DATABASE SCHEMA ===
${schema}

=== QUERY GUIDELINES ===
${queryGuide}

=== WRITE GUIDELINES ===
${writeGuide}

${snapshot}

Today's date: ${today}`;
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
          description: "Max rows returned. Default 50, max 200.",
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
        const limit = Math.min((input.limit as number | undefined) ?? 50, 200);

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
        return data;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";

    const userSvc = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user }, error: authErr } = await userSvc.auth.getUser();
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

    const incoming = { role: "user" as const, content: message };
    const claudeMessages = [...history, incoming];

    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = await buildSystemPrompt(svc, today);

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    let currentMessages = [...claudeMessages];
    let finalText = "";

    while (true) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOK,
        system: systemPrompt,
        tools: MSH_TOOLS,
        messages: currentMessages as Anthropic.MessageParam[],
      });

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolBlocks = response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

        const toolResults = await Promise.all(
          toolBlocks.map(async (block) => ({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(
              await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                svc,
              ),
            ),
          })),
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

    await svc
      .from("staff_sessions")
      .update({
        history: updatedHistory,
        ...(autoTitle ? { title: autoTitle } : {}),
      })
      .eq("id", currentSessionId);

    return new Response(
      JSON.stringify({
        text: finalText,
        session_id: currentSessionId,
        title: autoTitle ?? undefined,
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
