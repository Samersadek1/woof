// SECTION 1 - IMPORTS
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;

import qrcode from "qrcode-terminal";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// SECTION 2 - CLIENTS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const STAFF_GROUP = process.env.STAFF_GROUP_ID;
const MODEL = "claude-sonnet-4-6";
const MAX_TOK = 512;

// Keep import explicit per required structure.
void MessageMedia;

// SECTION 3 - WHATSAPP CLIENT
const puppeteerConfig = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-zygote",
  ],
};

if (process.env.CHROME_EXECUTABLE_PATH) {
  puppeteerConfig.executablePath = process.env.CHROME_EXECUTABLE_PATH;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: puppeteerConfig,
});

client.on("qr", (qr) => {
  console.log("\n=== SCAN THIS QR CODE IN WHATSAPP ===\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("\n\u2713 MSH WhatsApp agent ready\n");

  if (!STAFF_GROUP) {
    console.log("STAFF_GROUP_ID not set -- printing groups to find it:");
    const chats = await client.getChats();
    const groups = chats.filter((c) => c.isGroup);
    console.log("=== GROUP IDs ===");
    groups.forEach((g) => console.log(`${g.name}: ${g.id._serialized}`));
    console.log("=================\n");
  } else {
    console.log("Staff group:", STAFF_GROUP);
  }
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp disconnected:", reason);
  setTimeout(() => client.initialize(), 10_000);
});

// SECTION 4 - TOOL DEFINITIONS
const WA_TOOLS = [
  {
    name: "query_database",
    description: `Query MSH Supabase tables. Use for all data lookups.
      Always fetch owner and pet details in the same nested select as
      bookings -- never make separate follow-up queries.
      Correct pattern: bookings with rooms(display_name),
      owners(first_name,last_name), booking_pets(pets(name,species))`,
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
  {
    name: "call_rpc",
    description: `Call Supabase RPC. Available:
      is_off_peak(check_date) -> boolean
      resolve_boarding_rate(category, size_tier, season) -> numeric
      tier_discount_pct(member_type) -> 0/10/20/30
      resolve_line_total(booking_id) -> numeric
      generate_booking_ref() -> MSH-YYYY-NNNNN`,
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
    description: `Create a draft booking. Always confirm all details
      with the owner first and show a summary before calling this.
      Never create status=confirmed directly.`,
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
  {
    name: "escalate_to_human",
    description: `Hand the conversation to the receptionist.
      Use when: request is complex, owner is upset, pricing dispute,
      assessment needed, or you are uncertain about anything.
      Always use this rather than guessing.`,
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
];

// SECTION 6 - HELPER FUNCTIONS
async function notifyStaff(message) {
  if (!STAFF_GROUP) return;
  try {
    await client.sendMessage(STAFF_GROUP, message);
  } catch (e) {
    console.error("Staff notification failed:", e.message);
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let _rulesCache = null;
let _rulesCacheTs = 0;
const HOUR = 60 * 60 * 1000;

async function getBusinessRules() {
  try {
    if (_rulesCache && Date.now() - _rulesCacheTs < HOUR) {
      return _rulesCache;
    }
    const { data } = await supabase
      .from("system_context")
      .select("content")
      .eq("key", "business_rules")
      .single();
    _rulesCache = data?.content ?? "";
    _rulesCacheTs = Date.now();
    return _rulesCache;
  } catch {
    return "";
  }
}

async function buildSystemPrompt(ownerProfile) {
  const rules = await getBusinessRules();
  const today = new Date().toISOString().split("T")[0];

  return `You are the MSH booking assistant for MySecondHome,
a premium pet boarding facility in Dubai.
You are talking to a pet owner via WhatsApp.

OWNER:
${ownerProfile}

BUSINESS RULES:
${rules}

YOUR RULES:
- Keep messages short -- this is WhatsApp, not email
- Use the owner's first name
- Never confirm a booking yourself -- always create a draft
  and say "Let me check with the team and confirm shortly"
- Check availability before suggesting dates or rooms
- Calculate price including membership discount before quoting
- If uncertain about anything, call escalate_to_human
- Do not mention you are an AI unless directly asked

Today: ${today}`;
}

async function buildOwnerProfile(ownerId, phone) {
  let ownerProfile = "Unknown owner (phone: " + phone + ")";
  if (!ownerId) return ownerProfile;

  const { data: owner } = await supabase
    .from("owners")
    .select(`
      first_name, last_name, phone, member_type, wallet_balance,
      pets(id, name, species, breed, assessment_status)
    `)
    .eq("id", ownerId)
    .single();

  if (!owner) return ownerProfile;

  const petList = (owner.pets ?? [])
    .map(
      (p) =>
        `${p.name} (${p.species}, ${p.breed ?? "breed unknown"}, assessment: ${p.assessment_status})`
    )
    .join("\n  ");

  ownerProfile = `Name: ${owner.first_name} ${owner.last_name ?? ""}
Phone: ${owner.phone}
Membership: ${owner.member_type}
Wallet: AED ${owner.wallet_balance ?? 0}
Pets:
  ${petList || "No pets on file"}`;

  return ownerProfile;
}

async function ensureOwnerProfileColumn() {
  try {
    await supabase.rpc("execute_sql", {
      query: `
        ALTER TABLE agent_conversations
          ADD COLUMN IF NOT EXISTS owner_profile TEXT;
      `,
    });
  } catch {
    // Ignore startup migration errors (including column already existing).
  }
}

// SECTION 5 - TOOL EXECUTOR
async function executeTool(name, input, phone) {
  try {
    if (name === "query_database") {
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
        "wallet_transactions",
        "grooming_appointments",
        "boarding_rates",
        "grooming_package_rates",
        "addon_rates",
        "pricing",
      ]);

      if (!ALLOWED.has(input.table)) return { error: "Table not allowed" };

      let q = supabase
        .from(input.table)
        .select(input.select ?? "*")
        .limit(Math.min(input.limit ?? 50, 100));

      for (const [col, val] of Object.entries(input.filter ?? {})) {
        if (Array.isArray(val)) q = q.in(col, val);
        else if (typeof val === "object" && val !== null) {
          if (val.eq !== undefined) q = q.eq(col, val.eq);
          if (val.neq !== undefined) q = q.neq(col, val.neq);
          if (val.lt !== undefined) q = q.lt(col, val.lt);
          if (val.lte !== undefined) q = q.lte(col, val.lte);
          if (val.gt !== undefined) q = q.gt(col, val.gt);
          if (val.gte !== undefined) q = q.gte(col, val.gte);
        } else q = q.eq(col, val);
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return data;
    }

    if (name === "call_rpc") {
      const ALLOWED_RPC = new Set([
        "is_off_peak",
        "resolve_boarding_rate",
        "tier_discount_pct",
        "resolve_line_total",
        "generate_booking_ref",
      ]);
      if (!ALLOWED_RPC.has(input.function_name)) return { error: "RPC not allowed" };

      const { data, error } = await supabase.rpc(input.function_name, input.params ?? {});
      if (error) return { error: error.message };
      return data;
    }

    if (name === "create_draft_booking") {
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

      const { error: pErr } = await supabase.from("booking_pets").insert(
        input.pet_ids.map((pet_id) => ({
          booking_id: booking.id,
          pet_id,
        }))
      );

      if (pErr) {
        await supabase.from("bookings").delete().eq("id", booking.id);
        return { error: "Pet linking failed: " + pErr.message };
      }

      await supabase
        .from("agent_conversations")
        .update({ draft_booking: booking })
        .eq("phone_number", phone);

      await notifyStaff(
        "🐾 *Booking request from WhatsApp*\n\n" +
          "*Ref:* " +
          ref +
          "\n" +
          "*Check-in:* " +
          input.check_in_date +
          "\n" +
          "*Check-out:* " +
          input.check_out_date +
          "\n" +
          "*Pets:* " +
          input.pet_ids.length +
          " pet(s)\n\n" +
          "Reply in this chat:\n" +
          "✅ *!confirm " +
          ref +
          "* to approve\n" +
          "❌ *!reject " +
          ref +
          " [reason]* to decline"
      );

      return {
        success: true,
        booking_ref: ref,
        booking_id: booking.id,
        message: `Draft ${ref} created and sent to team for approval.`,
      };
    }

    if (name === "escalate_to_human") {
      await supabase
        .from("agent_conversations")
        .update({ mode: "human" })
        .eq("phone_number", phone);

      await notifyStaff(
        `🔔 WhatsApp conversation needs attention\n` +
          `Phone: ${phone}\n` +
          `Reason: ${input.reason}\n` +
          `Summary: ${input.summary}`
      );

      return { escalated: true };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: String(e) };
  }
}

// SECTION 7 - AGENT RUNNER
async function runAgent(phone, message) {
  let { data: conv } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("phone_number", phone)
    .single();

  if (!conv) {
    const { data: owner } = await supabase
      .from("owners")
      .select("id, first_name, last_name, member_type, wallet_balance")
      .eq("phone", phone)
      .single();

    const { data: newConv } = await supabase
      .from("agent_conversations")
      .insert({
        phone_number: phone,
        owner_id: owner?.id ?? null,
        mode: "agent",
        history: [],
      })
      .select()
      .single();

    conv = newConv;
  }

  let ownerProfile = "Unknown owner (phone: " + phone + ")";
  if (conv?.owner_profile) {
    ownerProfile = conv.owner_profile;
  } else {
    ownerProfile = await buildOwnerProfile(conv?.owner_id, phone);
    await supabase
      .from("agent_conversations")
      .update({ owner_profile: ownerProfile })
      .eq("phone_number", phone);
  }

  const history = conv?.history ?? [];
  const incoming = { role: "user", content: message };
  const claudeMessages = [...history, incoming];
  const systemPrompt = await buildSystemPrompt(ownerProfile);

  let currentMessages = [...claudeMessages];
  let finalText = "";

  while (true) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOK,
      system: systemPrompt,
      tools: WA_TOOLS,
      messages: currentMessages,
    });

    if (response.stop_reason === "end_turn") {
      finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolBlocks.map(async (block) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(await executeTool(block.name, block.input, phone)),
        }))
      );

      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
      continue;
    }

    finalText = "Something went wrong. Let me get someone to help you.";
    break;
  }

  const updatedHistory = [...claudeMessages, { role: "assistant", content: finalText }].slice(-30);

  await supabase
    .from("agent_conversations")
    .update({ history: updatedHistory })
    .eq("phone_number", phone);

  return finalText;
}

// SECTION 8 - MESSAGE HANDLERS
client.on("message", async (msg) => {
  if (msg.isStatus) return;
  if (msg.from.endsWith("@newsletter")) return;
  if (msg.from.endsWith("@lid")) return;
  if (msg.from.endsWith("@broadcast")) return;
  console.log("Message received:", msg.from, "|", msg.body.slice(0, 50));

  const isFromStaffGroup = STAFF_GROUP && msg.from === STAFF_GROUP;

  if (isFromStaffGroup) {
    const text = msg.body.trim();

    if (text.startsWith("!bot ")) {
      const rawNumber = text.slice(5).trim();
      const targetPhone = rawNumber.includes("@c.us")
        ? rawNumber
        : rawNumber.replace(/\s/g, "") + "@c.us";
      console.log("Activating agent for:", targetPhone);
      await supabase
        .from("agent_conversations")
        .upsert({ phone_number: targetPhone, mode: "agent" });
      await notifyStaff(`✓ Agent mode ON for ${targetPhone}`);

      const { data: conv } = await supabase
        .from("agent_conversations")
        .select("owner_id")
        .eq("phone_number", targetPhone)
        .single();

      let owner = null;
      if (conv?.owner_id) {
        const { data: ownerData } = await supabase
          .from("owners")
          .select("id, first_name")
          .eq("id", conv.owner_id)
          .single();
        owner = ownerData ?? null;
      }

      let formattedHistory = [];
      try {
        const chat = await client.getChatById(targetPhone);
        const recentMsgs = await chat.fetchMessages({ limit: 20 });
        console.log("History fetched:", recentMsgs.length, "messages");
        formattedHistory = recentMsgs
          .filter((m) => {
            if (!m.body?.trim()) return false;
            if (m.isStatus) return false;
            if (m.type === "revoked" || m.type === "revoked_ack") return false;
            return true;
          })
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .map((m) => ({
            role: m.fromMe ? "assistant" : "user",
            content: m.body,
          }));
        console.log(
          "Formatted history:",
          formattedHistory.map((m) => m.role + ": " + m.content.slice(0, 40))
        );
      } catch (e) {
        console.error("History fetch failed:", e.message);
      }

      const ownerProfile = await buildOwnerProfile(owner?.id ?? null, targetPhone);

      await supabase.from("agent_conversations").upsert(
        {
          phone_number: targetPhone,
          owner_id: owner?.id ?? null,
          mode: "agent",
          history: formattedHistory,
          owner_profile: ownerProfile,
        },
        { onConflict: "phone_number" }
      );

      const greeting = await runAgent(
        targetPhone,
        "[SYSTEM: You have just been connected to this conversation. Review the chat history above and greet the owner by name, acknowledging what they were asking about. Be warm and brief.]"
      );
      await client.sendMessage(targetPhone, greeting);
      return;
    }

    if (text.startsWith("!human ")) {
      const targetPhone = text.slice(7).trim().replace(/\s/g, "") + "@c.us";
      await supabase
        .from("agent_conversations")
        .update({ mode: "human" })
        .eq("phone_number", targetPhone);
      await notifyStaff(`✓ Human mode ON for ${targetPhone}`);
      return;
    }

    if (text.startsWith("!confirm ")) {
      const ref = text.slice(9).trim().toUpperCase();
      const { data: booking, error } = await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("booking_ref", ref)
        .eq("status", "draft")
        .select("id, booking_ref, check_in_date, check_out_date, owner_id")
        .single();

      if (error || !booking) {
        await notifyStaff(`✗ Could not confirm ${ref} -- not found or not a draft`);
        return;
      }

      const { data: conv } = await supabase
        .from("agent_conversations")
        .select("phone_number")
        .eq("owner_id", booking.owner_id)
        .single();

      if (conv?.phone_number) {
        await client.sendMessage(
          conv.phone_number,
          `Great news! Your booking ${ref} is confirmed ✓\n` +
            `Check-in: ${booking.check_in_date}\n` +
            `Check-out: ${booking.check_out_date}\n\n` +
            `See you then!`
        );
      }

      await supabase
        .from("agent_conversations")
        .update({ draft_booking: null })
        .eq("owner_id", booking.owner_id);

      await notifyStaff(`✓ ${ref} confirmed and owner notified`);
      return;
    }

    if (text.startsWith("!reject ")) {
      const parts = text.slice(8).trim().split(" ");
      const ref = parts[0].toUpperCase();
      const reason = parts.slice(1).join(" ") || "No reason given";

      await supabase
        .from("bookings")
        .update({ status: "cancelled", cancelled_reason: reason })
        .eq("booking_ref", ref)
        .eq("status", "draft");

      const { data: booking } = await supabase
        .from("bookings")
        .select("owner_id")
        .eq("booking_ref", ref)
        .single();

      if (booking?.owner_id) {
        const { data: conv } = await supabase
          .from("agent_conversations")
          .select("phone_number")
          .eq("owner_id", booking.owner_id)
          .single();

        if (conv?.phone_number) {
          await client.sendMessage(
            conv.phone_number,
            `I'm sorry, we weren't able to confirm that booking. ` +
              `${reason}. Please get in touch and we'll find another option.`
          );
        }
      }

      await notifyStaff(`✓ ${ref} cancelled and owner notified`);
      return;
    }

    return;
  }

  if (!msg.from.endsWith("@c.us")) return;

  const phone = msg.from;
  const { data: conv } = await supabase
    .from("agent_conversations")
    .select("mode")
    .eq("phone_number", phone)
    .single();

  const mode = conv?.mode ?? "human";
  if (mode !== "agent") return;

  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await runAgent(phone, msg.body);

    await chat.clearState();
    await client.sendMessage(phone, reply);
  } catch (err) {
    console.error("Agent error:", err);
    await client.sendMessage(
      phone,
      "Sorry, something went wrong. Let me get someone to help you."
    );
    await supabase
      .from("agent_conversations")
      .update({ mode: "human" })
      .eq("phone_number", phone);
    await notifyStaff(`⚠️ Agent error for ${phone}\n${err.message}\nSwitched to human mode`);
  }
});

client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  if (msg.from === msg.to) return;
  if (msg.to.endsWith("@g.us")) return;

  const text = msg.body.trim().toLowerCase();

  if (text === "!bot") {
    await msg.delete(true);
    const targetPhone = msg.to;

    const chat = await client.getChatById(targetPhone);
    const recentMsgs = await chat.fetchMessages({ limit: 20 });
    const history = recentMsgs
      .filter((m) => m.body && m.type !== "revoked")
      .map((m) => ({
        role: m.fromMe ? "assistant" : "user",
        content: m.body,
      }));

    await supabase.from("agent_conversations").upsert(
      {
        phone_number: targetPhone,
        mode: "agent",
        history,
      },
      { onConflict: "phone_number" }
    );

    const greeting = await runAgent(
      targetPhone,
      "[SYSTEM: You have just been connected to this conversation. Review the chat history and greet the owner by name, acknowledging what they were asking about. Be warm and brief.]"
    );
    await client.sendMessage(targetPhone, greeting);
    await notifyStaff(`🤖 Agent activated for ${targetPhone}`);
    return;
  }

  if (text === "!human") {
    await msg.delete(true);
    await supabase
      .from("agent_conversations")
      .update({ mode: "human" })
      .eq("phone_number", msg.to);
    await notifyStaff(`👤 Human mode for ${msg.to}`);
    return;
  }
});

// SECTION 9 - START
console.log("Starting MSH WhatsApp agent...");
await ensureOwnerProfileColumn();
client.initialize();
