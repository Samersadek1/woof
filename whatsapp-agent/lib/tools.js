// Tool registry + executor. Builds the Anthropic tool definitions the model
// can use, and runs them against Supabase. Tenants opt in by inserting rows
// into tenant_tools (tool_name, enabled, permissions, description_override,
// schema_override).
//
// New tools are added in three steps:
//   1. Add an entry to CATALOG with description, schema, and config.
//   2. Add a handler in HANDLERS keyed on the tool name.
//   3. INSERT a row into tenant_tools for each tenant that should get it.

const CATALOG = {
  query_database: {
    permissions: "read",
    description: `Query Supabase tables. Use for all data lookups.
      Always fetch owner and pet details in the same nested select as
      bookings -- never make separate follow-up queries.
      Correct pattern: bookings with rooms(display_name),
      owners(first_name,last_name), booking_pets(pets(name,species)).
      IMPORTANT: For table "rooms", use conservative selects like "id,display_name"
      and avoid non-existent columns like rooms.category / rooms.type / rooms.capacity.`,
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
    config: {
      allowedTables: [
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
        "wallet_transactions",
        "grooming_appointments",
        "boarding_rates",
        "grooming_package_rates",
        "addon_rates",
        "pricing",
      ],
    },
  },
  call_rpc: {
    permissions: "read",
    description: `Call Supabase RPC. Available:
      is_off_peak(check_date) -> boolean
      resolve_boarding_rate(category, size_tier, season) -> numeric
      tier_discount_pct(member_type) -> 0/10/20/30
      resolve_line_total(booking_id) -> numeric
      generate_booking_ref() -> tenant booking ref`,
    input_schema: {
      type: "object",
      properties: {
        function_name: { type: "string" },
        params: { type: "object" },
      },
      required: ["function_name"],
    },
    config: {
      allowedRpc: [
        "is_off_peak",
        "resolve_boarding_rate",
        "tier_discount_pct",
        "resolve_line_total",
        "generate_booking_ref",
      ],
    },
  },
  create_draft_booking: {
    permissions: "write",
    description: `Create a draft booking record after confirming details with the
      owner. Always saved as draft; staff confirm or reject in the staff group.`,
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
    description: `Hand the conversation to staff. Use when the request is
      complex, the owner is upset, there is a pricing dispute, an assessment
      is needed, or the agent is uncertain.`,
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
  if (result?.error) return `error=${result.error}`;
  if (Array.isArray(result)) return `rows=${result.length}`;
  if (result && typeof result === "object") {
    if (result.row_count !== undefined) return `rows=${result.row_count}`;
    if (result.message) return String(result.message).slice(0, 120);
  }
  return String(result).slice(0, 120);
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function runQueryDatabase({ supabase }, input, _ctx, toolCfg) {
  const allowedTables = new Set(toolCfg.config?.allowedTables ?? []);
  if (!allowedTables.has(input.table)) return { error: "Table not allowed" };

  let q = supabase
    .from(input.table)
    .select(input.select ?? "*")
    .limit(Math.min(input.limit ?? 50, 100));

  for (const [col, val] of Object.entries(input.filter ?? {})) {
    if (Array.isArray(val)) {
      q = q.in(col, val);
    } else if (typeof val === "object" && val !== null) {
      if (val.eq !== undefined) q = q.eq(col, val.eq);
      if (val.neq !== undefined) q = q.neq(col, val.neq);
      if (val.lt !== undefined) q = q.lt(col, val.lt);
      if (val.lte !== undefined) q = q.lte(col, val.lte);
      if (val.gt !== undefined) q = q.gt(col, val.gt);
      if (val.gte !== undefined) q = q.gte(col, val.gte);
    } else {
      q = q.eq(col, val);
    }
  }

  const { data, error } = await q;
  if (error) {
    const message = String(error.message ?? "");
    if (
      input.table === "rooms" &&
      /column rooms\.(category|type|capacity) does not exist/i.test(message)
    ) {
      return {
        recoverable: true,
        message:
          "rooms schema hint: select existing fields only (e.g. id, display_name). " +
          "Do not query rooms.category, rooms.type, or rooms.capacity.",
      };
    }
    return { error: message };
  }
  return data;
}

async function runCallRpc({ supabase }, input, _ctx, toolCfg) {
  const allowedRpc = new Set(toolCfg.config?.allowedRpc ?? []);
  if (!allowedRpc.has(input.function_name)) return { error: "RPC not allowed" };
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

async function runEscalateToHuman({ notifyStaff, setAwaitingStaffDirection }, input, ctx) {
  console.warn("Escalation requested by agent:", { phone: ctx.phone, reason: input.reason });
  await setAwaitingStaffDirection(ctx.phone, input.reason, input.summary);
  await notifyStaff(
    `🔔 WhatsApp conversation needs attention\n` +
      `Phone: ${ctx.phone}\n` +
      `Reason: ${input.reason}\n` +
      `Summary: ${input.summary}\n\n` +
      `Reply directly to this message with guidance for the bot.\n` +
      `[#route phone=${ctx.phone} state=awaiting_staff]`,
  );
  return { escalated: true };
}

const HANDLERS = {
  query_database: runQueryDatabase,
  call_rpc: runCallRpc,
  create_draft_booking: runCreateDraftBooking,
  save_memory: runSaveMemory,
  escalate_to_human: runEscalateToHuman,
};

// Factory. Returns an executeTool(name, input, phone) bound to the supplied
// dependencies. The agent runner does not reach into Supabase or the channel
// directly -- it goes through here.
export function createToolExecutor({
  supabase,
  notifyStaff,
  logEvent,
  setAwaitingStaffDirection,
  getToolConfig,
  getTenantId = () => null,
}) {
  const services = {
    supabase,
    notifyStaff,
    logEvent,
    setAwaitingStaffDirection,
    getTenantId,
  };

  return async function executeTool(name, input, phone) {
    try {
      const toolCfg = getToolConfig(name);
      if (!toolCfg) return { error: `Tool not enabled for tenant: ${name}` };

      const handler = HANDLERS[name];
      if (!handler) return { error: `Unknown tool: ${name}` };

      return await handler(services, input, { phone }, toolCfg);
    } catch (e) {
      return { error: String(e) };
    }
  };
}
