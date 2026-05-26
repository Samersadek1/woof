// Tool registry + executor. Builds the Anthropic tool definitions the model
// can use, and runs them against Supabase. Tenants opt in by inserting rows
// into tenant_tools (tool_name, enabled, permissions, description_override,
// schema_override).
//
// New tools are added in three steps:
//   1. Add an entry to CATALOG with description, schema, and config.
//   2. Add a handler in HANDLERS keyed on the tool name.
//   3. INSERT a row into tenant_tools for each tenant that should get it.
//
// New WRITE capabilities should NOT be added as JS tools -- create a
// public.agent_<action>(...) Postgres function instead. agent_introspect()
// auto-discovers it and the model can call it via call_rpc.

import { buildStaffEscalationMessage } from "./escalation-summary.js";

const CATALOG = {
  query_database: {
    permissions: "read",
    description: `Query Supabase tables. Use for all data lookups. Refer to
      SCHEMA REFERENCE in the system prompt for the authoritative list of
      tables and columns. Always fetch related rows via nested selects rather
      than making follow-up queries (e.g. bookings with rooms(display_name),
      owners(first_name,last_name), booking_pets(pets(name,species))).`,
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string" },
        select: { type: "string" },
        filter: { type: "object" },
        limit: { type: "number" },
      },
      required: ["table"],
    },
  },
  call_rpc: {
    permissions: "read",
    description: `Call a Supabase RPC. Refer to SCHEMA REFERENCE for the
      authoritative list of available RPCs and their argument signatures.`,
    input_schema: {
      type: "object",
      properties: {
        function_name: { type: "string" },
        params: { type: "object" },
      },
      required: ["function_name"],
    },
  },
  create_draft_booking: {
    permissions: "write",
    description: `Create a draft BOARDING booking (overnight stay in a room).
      Use ONLY for boarding -- not for daycare, grooming, or assessments.
      Saved as draft; staff confirm or reject in the staff group.`,
    input_schema: {
      type: "object",
      properties: {
        owner_id: { type: "string" },
        pet_ids: { type: "array", items: { type: "string" } },
        room_id: { type: "string" },
        check_in_date: { type: "string" },
        check_out_date: { type: "string" },
        add_ons: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["owner_id", "pet_ids", "room_id", "check_in_date", "check_out_date"],
    },
  },
  update_owner_profile: {
    permissions: "write",
    description: `Update editable fields on the OWNER currently in the conversation.
      Use when the owner asks to correct or update their personal details (e.g.
      "fix my surname", "update my email", "change my emergency contact").
      Only the conversation's resolved owner can be updated -- never accept an
      arbitrary owner_id from the user. Editable fields: first_name, last_name,
      email, address, phone2, vet_name, vet_phone, emergency_contact_name,
      emergency_contact_phone. Anything else (membership, wallet, phone,
      emirates_id, billing) MUST be escalated to staff instead.`,
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "object",
          description: "Object with one or more editable fields to set.",
          properties: {
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            address: { type: "string" },
            phone2: { type: "string" },
            vet_name: { type: "string" },
            vet_phone: { type: "string" },
            emergency_contact_name: { type: "string" },
            emergency_contact_phone: { type: "string" },
          },
        },
      },
      required: ["updates"],
    },
    config: {
      editableFields: [
        "first_name",
        "last_name",
        "email",
        "address",
        "phone2",
        "vet_name",
        "vet_phone",
        "emergency_contact_name",
        "emergency_contact_phone",
      ],
    },
  },
  save_memory: {
    permissions: "write",
    description: `Save an important fact about this owner or conversation to
      persistent memory. Use when you learn something that will be useful in
      future turns: confirmed booking details, owner preferences, specific
      instructions, allergies, or pets to focus on. Do not save conversational
      filler. Memory is surfaced in the system prompt on every future turn.`,
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Short identifier, snake_case. e.g. preferred_room, pet_allergy, confirmed_dates",
        },
        value: { type: "string", description: "The fact to remember (1-2 sentences)" },
      },
      required: ["key", "value"],
    },
  },
  escalate_to_human: {
    permissions: "escalation",
    description: `Hand the conversation to staff. Use sparingly and ONLY when:
      (a) the request is genuinely outside the agent's scope (refunds, complaints,
      payment disputes, medical emergencies, sensitive profile fields like
      membership/billing/phone/emirates_id), or (b) the owner explicitly asks
      to talk to a human. Do NOT escalate just because data is missing -- ask
      the owner instead. Do NOT escalate to "double-check" a routine booking;
      create the draft booking instead and let staff approve via !confirm.
      IMPORTANT: escalation is a HANDOFF, not task completion. After calling
      this tool, tell the owner that you've passed it to the team -- never say
      "Done" or imply the change has been made.`,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        summary: {
          type: "string",
          description: "Brief summary for the receptionist",
        },
      },
      required: ["reason", "summary"],
    },
  },
};

export function buildToolDefinitions(tenantTools) {
  const enabled = (tenantTools ?? []).filter((t) => t?.enabled !== false);
  if (!enabled.length) {
    return [];
  }
  const definitions = [];
  for (const row of enabled) {
    const base = CATALOG[row.tool_name];
    if (!base) continue;
    definitions.push({
      name: row.tool_name,
      description: row.description_override ?? base.description,
      input_schema: row.schema_override ?? base.input_schema,
    });
  }
  return definitions;
}

export function buildToolConfigMap(tenantTools) {
  const map = new Map();
  for (const row of tenantTools ?? []) {
    const base = CATALOG[row.tool_name];
    if (!base) continue;
    map.set(row.tool_name, {
      permissions: row.permissions ?? base.permissions,
      config: { ...(base.config ?? {}), ...(row.config ?? {}) },
    });
  }
  return map;
}

export function summarizeToolResult(result) {
  if (result?.error) return `error=${String(result.error).slice(0, 120)}`;
  if (Array.isArray(result)) return `rows=${result.length}`;
  if (!result || typeof result !== "object") return String(result ?? "").slice(0, 120);

  if (result.row_count !== undefined) return `rows=${result.row_count}`;
  if (result.message) return String(result.message).slice(0, 120);
  if (result.escalated) return "escalated";
  if (result.success && result.booking_ref) return `draft=${result.booking_ref}`;
  if (result.success && Array.isArray(result.updated_fields)) {
    return `updated=${result.updated_fields.join(",").slice(0, 80)}`;
  }
  if (result.saved && result.key) return `saved=${result.key}`;

  return Object.entries(result)
    .slice(0, 4)
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .join(",")
    .slice(0, 120);
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const FILTER_OPERATORS = ["eq", "neq", "lt", "lte", "gt", "gte"];

async function logCapabilityRequest({ supabase, getTenantId }, ctx, kind, name, payload) {
  try {
    await supabase.from("agent_capability_requests").insert({
      tenant_id: getTenantId?.() ?? null,
      chat_id: ctx?.phone ?? null,
      attempted_capability: name,
      attempted_kind: kind,
      attempted_payload: payload ?? null,
      trigger_message: ctx?.lastUserMessage ?? null,
    });
  } catch (err) {
    console.error("logCapabilityRequest failed:", err?.message ?? err);
  }
}

async function runQueryDatabase(services, input, ctx) {
  const { supabase, getSchemaCache } = services;
  const cache = getSchemaCache();
  if (!cache?.allowedTables.has(input.table)) {
    await logCapabilityRequest(services, ctx, "table", input.table, input);
    return { error: `Table not allowed or unknown: ${input.table}` };
  }

  let q = supabase
    .from(input.table)
    .select(input.select ?? "*")
    .limit(Math.min(input.limit ?? 50, 100));

  for (const [col, val] of Object.entries(input.filter ?? {})) {
    if (Array.isArray(val)) {
      q = q.in(col, val);
    } else if (val && typeof val === "object") {
      for (const op of FILTER_OPERATORS) {
        if (val[op] !== undefined) q = q[op](col, val[op]);
      }
    } else {
      q = q.eq(col, val);
    }
  }

  const { data, error } = await q;
  if (error) return { error: String(error.message ?? error) };
  return data;
}

async function runCallRpc(services, input, ctx) {
  const { supabase, getSchemaCache } = services;
  const cache = getSchemaCache();
  if (!cache?.allowedRpcs.has(input.function_name)) {
    await logCapabilityRequest(services, ctx, "rpc", input.function_name, input.params ?? null);
    return { error: `RPC not allowed or unknown: ${input.function_name}` };
  }
  const { data, error } = await supabase.rpc(input.function_name, input.params ?? {});
  if (error) return { error: error.message };
  return data;
}

async function runCreateDraftBooking({ supabase, notifyStaff }, input, ctx) {
  const { data: ref } = await supabase.rpc("generate_booking_ref");
  if (!ref) return { error: "Could not generate booking ref" };

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .insert({
      booking_ref: ref,
      owner_id: input.owner_id,
      room_id: input.room_id,
      check_in_date: input.check_in_date,
      check_out_date: input.check_out_date,
      status: "draft",
      notes: input.notes ?? null,
      created_by: "WhatsApp agent",
      add_ons: input.add_ons ?? [],
    })
    .select("id, booking_ref, check_in_date, check_out_date")
    .single();
  if (bErr || !booking) return { error: bErr?.message ?? "Insert failed" };

  const { error: pErr } = await supabase
    .from("booking_pets")
    .insert(input.pet_ids.map((pet_id) => ({ booking_id: booking.id, pet_id })));
  if (pErr) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    return { error: "Pet linking failed: " + pErr.message };
  }

  await supabase
    .from("agent_conversations")
    .update({ draft_booking: booking })
    .eq("phone_number", ctx.phone);

  await notifyStaff(
    `🐾 *Booking request from WhatsApp*\n\n` +
      `*Ref:* ${ref}\n` +
      `*Check-in:* ${input.check_in_date}\n` +
      `*Check-out:* ${input.check_out_date}\n` +
      `*Pets:* ${input.pet_ids.length} pet(s)\n\n` +
      `Reply in this chat:\n` +
      `✅ *!confirm ${ref}* to approve\n` +
      `❌ *!reject ${ref} [reason]* to decline`,
  );

  return {
    success: true,
    booking_ref: ref,
    booking_id: booking.id,
    message: `Draft ${ref} created and sent to team for approval.`,
  };
}

async function runUpdateOwnerProfile({ supabase, logEvent, getTenantId }, input, ctx, toolCfg) {
  const editable = new Set(toolCfg.config?.editableFields ?? []);
  const updates = input?.updates && typeof input.updates === "object" ? input.updates : {};

  const { data: conv } = await supabase
    .from("agent_conversations")
    .select("owner_id")
    .eq("phone_number", ctx.phone)
    .maybeSingle();
  const ownerId = conv?.owner_id ?? null;
  if (!ownerId) {
    return { error: "Cannot update profile: no owner is linked to this conversation yet." };
  }

  const sanitized = {};
  for (const [key, raw] of Object.entries(updates)) {
    if (!editable.has(key) || raw == null) continue;
    const value = String(raw).trim();
    if (value) sanitized[key] = value.slice(0, 200);
  }
  const updatedFields = Object.keys(sanitized);
  if (!updatedFields.length) {
    return { error: "No editable fields supplied. Allowed: " + [...editable].join(", ") };
  }

  const { data: updated, error: upErr } = await supabase
    .from("owners")
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq("id", ownerId)
    .select(
      "id, first_name, last_name, email, address, phone2, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone",
    )
    .single();
  if (upErr || !updated) {
    return { error: `Profile update failed: ${upErr?.message ?? "unknown"}` };
  }

  await supabase
    .from("agent_conversations")
    .update({ owner_profile: null })
    .eq("phone_number", ctx.phone);

  await logEvent({
    tenant_id: getTenantId(),
    chat_id: ctx.phone,
    event: "profile_updated",
    payload: { fields: updatedFields },
  });

  return {
    success: true,
    owner_id: ownerId,
    updated_fields: updatedFields,
    profile: updated,
    message: "Profile updated.",
  };
}

async function runSaveMemory({ supabase, logEvent, getTenantId }, input, ctx) {
  const key = String(input?.key ?? "").trim();
  const value = String(input?.value ?? "").trim();
  if (!key) return { error: "save_memory requires a non-empty key" };
  if (!value) return { error: "save_memory requires a non-empty value" };

  const { data: convState } = await supabase
    .from("agent_conversations")
    .select("facts")
    .eq("phone_number", ctx.phone)
    .maybeSingle();

  const previous =
    convState?.facts && typeof convState.facts.memory === "object" && convState.facts.memory
      ? convState.facts.memory
      : {};

  const updatedMemory = {
    ...previous,
    [key]: value.slice(0, 500),
    last_updated: new Date().toISOString(),
  };
  const updatedFacts = { ...(convState?.facts ?? {}), memory: updatedMemory };

  const { error: upErr } = await supabase
    .from("agent_conversations")
    .update({ facts: updatedFacts })
    .eq("phone_number", ctx.phone);
  if (upErr) return { error: `save_memory failed: ${upErr.message}` };

  await logEvent({
    tenant_id: getTenantId(),
    chat_id: ctx.phone,
    event: "memory_saved",
    payload: { key },
  });

  return { saved: true, key };
}

async function runEscalateToHuman(services, input, ctx) {
  const { notifyStaff, setAwaitingStaffDirection, anthropic, getNarrativeModel } = services;
  console.warn("Escalation requested by agent:", { phone: ctx.phone, reason: input.reason });
  await setAwaitingStaffDirection(ctx.phone, input.reason, input.summary);

  const built = await buildStaffEscalationMessage({
    phone: ctx.phone,
    ownerProfile: ctx.ownerProfile,
    lastUserMessage: ctx.lastUserMessage,
    toolTrace: ctx.toolTrace ?? [],
    reason: input.reason || "agent_blocked",
    modelReason: input.reason,
    modelSummary: input.summary,
    anthropic,
    narrativeModel: getNarrativeModel?.() ?? null,
  });

  await notifyStaff(built.text);
  return { escalated: true, staff_notification: built.text };
}

const HANDLERS = {
  query_database: runQueryDatabase,
  call_rpc: runCallRpc,
  create_draft_booking: runCreateDraftBooking,
  update_owner_profile: runUpdateOwnerProfile,
  save_memory: runSaveMemory,
  escalate_to_human: runEscalateToHuman,
};

// Factory. Returns an executeTool(name, input, phone, turnCtx?) bound to the
// supplied dependencies. The agent runner does not reach into Supabase or the
// channel directly -- it goes through here.
//
// turnCtx (optional) is forwarded to handlers as part of ctx and carries
// per-turn data (ownerProfile, toolTrace, lastUserMessage). Today only
// escalate_to_human and the capability-gap log read it; other handlers ignore.
export function createToolExecutor({
  supabase,
  notifyStaff,
  logEvent,
  setAwaitingStaffDirection,
  getToolConfig,
  getSchemaCache = () => null,
  getTenantId = () => null,
  anthropic = null,
  getNarrativeModel = () => null,
}) {
  const services = {
    supabase,
    notifyStaff,
    logEvent,
    setAwaitingStaffDirection,
    getSchemaCache,
    getTenantId,
    anthropic,
    getNarrativeModel,
  };

  return async function executeTool(name, input, phone, turnCtx = null) {
    try {
      const toolCfg = getToolConfig(name);
      if (!toolCfg) {
        await logCapabilityRequest(services, { ...(turnCtx ?? {}), phone }, "tool", name, input);
        return { error: `Tool not enabled for tenant: ${name}` };
      }

      const handler = HANDLERS[name];
      if (!handler) return { error: `Unknown tool: ${name}` };

      const ctx = { ...(turnCtx ?? {}), phone };
      return await handler(services, input, ctx, toolCfg);
    } catch (e) {
      return { error: String(e) };
    }
  };
}
