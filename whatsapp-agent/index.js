// SECTION 1 - IMPORTS
import pkg from "whatsapp-web.js";
const { Client, RemoteAuth, MessageMedia } = pkg;

import qrcode from "qrcode-terminal";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import express from "express";
import QRCode from "qrcode";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// SECTION 2 - CLIENTS
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
  );
}
if (!ANTHROPIC_API_KEY) {
  throw new Error("Missing Anthropic config. Set ANTHROPIC_API_KEY.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { realtime: { transport: ws } }
);

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

const STAFF_GROUP = process.env.STAFF_GROUP_ID;
const MODEL = "claude-sonnet-4-6";
const MAX_TOK = 512;
const SESSION_BUCKET = "whatsapp-sessions";
const WA_SESSION_CLIENT_ID = process.env.WA_SESSION_CLIENT_ID || "msh-whatsapp-main";
const sessionObjectPath = (session) => `${session}.zip`;
const localSessionZipPath = (session) => resolve(".wwebjs_auth", `${session}.zip`);
const MAX_CONSECUTIVE_AGENT_ERRORS = 3;
const MAX_TOOL_ROUNDS = 4;
const INIT_GUARD_TIMEOUT_MS = Number(process.env.WA_INIT_GUARD_TIMEOUT_MS ?? 120000);
const READY_STALL_TIMEOUT_MS = Number(process.env.WA_READY_STALL_TIMEOUT_MS ?? 180000);
const MAX_AUTO_RECOVERY_RETRIES = Number(process.env.WA_MAX_AUTO_RECOVERY_RETRIES ?? 2);
const agentErrorCounts = new Map();
let isClientInitializing = false;
let isClientReady = false;
let isShuttingDown = false;
let initGuardTimer = null;
let readyStallTimer = null;
let autoRecoveryAttempts = 0;
let latestQR = null;

// Keep import explicit per required structure.
void MessageMedia;

// SECTION 3 - WHATSAPP CLIENT
const store = {
  async sessionExists({ session }) {
    const { data, error } = await supabase.storage
      .from(SESSION_BUCKET)
      .list("", { search: sessionObjectPath(session) });
    if (error) {
      console.error("RemoteAuth sessionExists failed:", {
        session,
        error: error.message,
      });
      throw new Error(`Session check failed: ${error.message}`);
    }
    const exists = Array.isArray(data) && data.length > 0;
    console.log("RemoteAuth sessionExists:", { session, exists });
    return exists;
  },

  async save({ session, path }) {
    try {
      const filePath = path ?? localSessionZipPath(session);
      const payload = await readFile(filePath);
      const { error } = await supabase.storage
        .from(SESSION_BUCKET)
        .upload(sessionObjectPath(session), payload, {
          upsert: true,
          contentType: "application/zip",
        });
      if (error) throw new Error(error.message);
      console.log("RemoteAuth save success:", {
        session,
        object: sessionObjectPath(session),
        bytes: payload.length,
      });
    } catch (e) {
      console.error("RemoteAuth save failed:", { session, error: e.message });
      throw new Error(`Session save failed: ${e.message}`);
    }
  },

  async extract({ session, path }) {
    try {
      const targetPath = path ?? localSessionZipPath(session);
      const { data, error } = await supabase.storage
        .from(SESSION_BUCKET)
        .download(sessionObjectPath(session));
      if (error) throw new Error(error.message);
      const bytes = Buffer.from(await data.arrayBuffer());
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, bytes);
      console.log("RemoteAuth extract success:", {
        session,
        object: sessionObjectPath(session),
        bytes: bytes.length,
      });
    } catch (e) {
      console.error("RemoteAuth extract failed:", { session, error: e.message });
      throw new Error(`Session extract failed: ${e.message}`);
    }
  },

  async delete({ session }) {
    try {
      const { error } = await supabase.storage
        .from(SESSION_BUCKET)
        .remove([sessionObjectPath(session)]);
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("RemoteAuth delete failed:", { session, error: e.message });
      throw new Error(`Session delete failed: ${e.message}`);
    }
  },
};

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
  authStrategy: new RemoteAuth({
    store,
    clientId: WA_SESSION_CLIENT_ID,
    backupSyncIntervalMs: 300000,
  }),
  puppeteer: puppeteerConfig,
});

client.on("qr", (qr) => {
  latestQR = qr;
  console.log("QR code ready -- open the Railway URL to scan");
});

function clearInitGuardTimer() {
  if (initGuardTimer) {
    clearTimeout(initGuardTimer);
    initGuardTimer = null;
  }
}

function clearReadyStallTimer() {
  if (readyStallTimer) {
    clearTimeout(readyStallTimer);
    readyStallTimer = null;
  }
}

async function scheduleAutoRecover(reason) {
  if (isShuttingDown) return;
  if (autoRecoveryAttempts >= MAX_AUTO_RECOVERY_RETRIES) {
    console.error("Auto-recovery skipped (retry limit reached):", {
      reason,
      attempts: autoRecoveryAttempts,
      max: MAX_AUTO_RECOVERY_RETRIES,
    });
    return;
  }

  autoRecoveryAttempts += 1;
  console.error("Auto-recovery triggered:", {
    reason,
    attempt: autoRecoveryAttempts,
    max: MAX_AUTO_RECOVERY_RETRIES,
  });
  clearInitGuardTimer();
  clearReadyStallTimer();
  isClientInitializing = false;
  isClientReady = false;
  try {
    await client.destroy();
    console.log("Client destroyed for auto-recovery");
  } catch (err) {
    console.error("Client destroy failed during auto-recovery:", err?.message ?? err);
  }
  setTimeout(() => queueClientInitialize(`auto-recover:${reason}`), 5000);
}

function armReadyStallTimer(trigger) {
  clearReadyStallTimer();
  readyStallTimer = setTimeout(() => {
    if (!isClientReady) {
      void scheduleAutoRecover(`ready-timeout:${trigger}`);
    }
  }, READY_STALL_TIMEOUT_MS);
}

client.on("ready", async () => {
  isClientReady = true;
  autoRecoveryAttempts = 0;
  clearReadyStallTimer();
  clearInitGuardTimer();
  latestQR = null;
  console.log("✓ MSH WhatsApp agent ready");
  console.log("RemoteAuth client ID:", WA_SESSION_CLIENT_ID);

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

client.on("authenticated", () => {
  console.log("WhatsApp authenticated");
});

client.on("auth_failure", (message) => {
  console.error("WhatsApp auth failure:", message);
  void scheduleAutoRecover("auth_failure");
});

client.on("change_state", (state) => {
  console.log("WhatsApp state changed:", state);
});

client.on("loading_screen", (percent, message) => {
  console.log("WhatsApp loading screen:", { percent, message });
});

client.on("disconnected", (reason) => {
  isClientReady = false;
  clearReadyStallTimer();
  clearInitGuardTimer();
  console.error("WhatsApp disconnected:", reason);
  setTimeout(() => queueClientInitialize("disconnected"), 10_000);
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

async function buildSystemPrompt(ownerProfile, options = {}) {
  const rules = await getBusinessRules();
  const today = new Date().toISOString().split("T")[0];
  const handoffSection = options.handoff?.pending_request
    ? `\nHANDOFF CONTEXT:\nThe owner sent this request before bot activation:\n${options.handoff.pending_request}\nPrioritize answering this request first.\n`
    : "";
  const factsSection = options.facts && Object.keys(options.facts).length
    ? `\nCONVERSATION FACTS:\n${JSON.stringify(options.facts, null, 2)}\n`
    : "";

  return `You are the MSH booking assistant for MySecondHome,
a premium pet boarding facility in Dubai.
You are talking to a pet owner via WhatsApp.

OWNER:
${ownerProfile}

BUSINESS RULES:
${rules}
${handoffSection}
${factsSection}

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

function normalizeDigits(value) {
  return (value ?? "").toString().replace(/\D/g, "");
}

function phoneDigitsCandidates(phone) {
  const digits = normalizeDigits(phone.replace(/@(c\.us|lid)$/i, ""));
  const out = new Set();
  if (!digits) return out;

  out.add(digits);

  if (digits.startsWith("00") && digits.length > 2) {
    out.add(digits.slice(2));
  }
  if (digits.startsWith("971") && digits.length > 3) {
    out.add(`0${digits.slice(3)}`);
  }
  if (digits.startsWith("0") && digits.length > 1) {
    out.add(`971${digits.slice(1)}`);
  }

  return out;
}

function canonicalConversationPhone(value) {
  const raw = (value ?? "").toString().trim();
  if (raw.endsWith("@lid")) {
    // Keep LID IDs as-is to avoid generating fake c.us keys from non-phone IDs.
    return raw;
  }
  const digits = normalizeDigits(raw.replace(/@(c\.us|lid)$/i, ""));
  if (digits) return `${digits}@c.us`;
  if (/@(c\.us|lid)$/i.test(raw)) return raw;
  return `${raw.replace(/\s/g, "")}@c.us`;
}

async function resolveInboundRouting(msg) {
  const replyTarget = msg.from;
  if (replyTarget.endsWith("@c.us")) {
    const conversationPhone = canonicalConversationPhone(replyTarget);
    return {
      replyTarget,
      conversationPhone,
      lookupCandidates: [conversationPhone, replyTarget],
      source: "direct",
    };
  }

  let contactDigits = "";
  try {
    const contact = await msg.getContact();
    // Prefer the contact phone number; do not use LID user IDs as phone numbers.
    contactDigits = normalizeDigits(contact?.number ?? "");
  } catch {
    // Ignore contact lookup failures and use raw ID fallback.
  }

  if (contactDigits) {
    const mappedPhone = canonicalConversationPhone(contactDigits);
    return {
      replyTarget,
      conversationPhone: mappedPhone,
      lookupCandidates: [mappedPhone, replyTarget],
      source: "contact_match",
    };
  }

  const rawConversationPhone = canonicalConversationPhone(replyTarget);
  return {
    replyTarget,
    conversationPhone: rawConversationPhone,
    lookupCandidates: [rawConversationPhone, replyTarget],
    source: "fallback",
  };
}

async function resolveTargetJidForActivation(rawTarget) {
  const cleaned = (rawTarget ?? "").toString().replace(/\s/g, "");
  if (!cleaned) return cleaned;
  if (cleaned.includes("@")) return cleaned;

  const candidates = phoneDigitsCandidates(cleaned);
  if (!candidates.size) return canonicalConversationPhone(cleaned);

  try {
    const chats = await client.getChats();
    for (const chat of chats) {
      if (chat.isGroup) continue;
      const jid = chat?.id?._serialized ?? "";
      if (!jid.endsWith("@c.us") && !jid.endsWith("@lid")) continue;

      let chatDigits = "";
      if (jid.endsWith("@c.us")) {
        chatDigits = normalizeDigits(jid.replace(/@c\.us$/i, ""));
      } else {
        try {
          const contact = await chat.getContact();
          chatDigits = normalizeDigits(contact?.number ?? "");
        } catch {
          chatDigits = "";
        }
      }

      if (phoneLikelyMatches(chatDigits, candidates)) {
        console.log("Activation JID resolved from chats:", {
          rawTarget: cleaned,
          resolvedJid: jid,
          source: "chat_lookup",
        });
        return jid;
      }
    }
  } catch (err) {
    console.error("Activation JID lookup failed:", err?.message ?? err);
  }

  // If chat lookup misses (common with LID identities), reuse the most recently
  // active conversation alias for the same owner before falling back.
  try {
    const owner = await findOwnerByFlexiblePhone(cleaned);
    if (owner?.id) {
      const { data: aliases } = await supabase
        .from("agent_conversations")
        .select("phone_number, updated_at")
        .eq("owner_id", owner.id)
        .order("updated_at", { ascending: false })
        .limit(10);

      for (const alias of aliases ?? []) {
        const aliasJid = (alias.phone_number ?? "").toString();
        if (!aliasJid.endsWith("@c.us") && !aliasJid.endsWith("@lid")) continue;
        try {
          await client.getChatById(aliasJid);
          console.log("Activation JID resolved from owner alias:", {
            rawTarget: cleaned,
            resolvedJid: aliasJid,
            source: "owner_alias",
          });
          return aliasJid;
        } catch {
          // Skip stale alias entries not currently available in WA session.
        }
      }
    }
  } catch (err) {
    console.error("Activation owner-alias lookup failed:", err?.message ?? err);
  }

  const fallback = canonicalConversationPhone(cleaned);
  console.log("Activation JID fallback:", {
    rawTarget: cleaned,
    resolvedJid: fallback,
    source: "canonical_fallback",
  });
  return fallback;
}

function phoneLikelyMatches(ownerDigits, candidateDigitsSet) {
  if (!ownerDigits) return false;
  for (const c of candidateDigitsSet) {
    if (!c) continue;
    if (ownerDigits === c) return true;
    if (ownerDigits.endsWith(c) || c.endsWith(ownerDigits)) return true;
    if (ownerDigits.slice(-9) === c.slice(-9) && ownerDigits.length >= 9 && c.length >= 9) {
      return true;
    }
    if (ownerDigits.slice(-8) === c.slice(-8) && ownerDigits.length >= 8 && c.length >= 8) {
      return true;
    }
  }
  return false;
}

async function findOwnerByFlexiblePhone(phone) {
  const candidates = phoneDigitsCandidates(phone);
  if (!candidates.size) return null;

  // Pull likely matches by searchable digit tails, then confirm with strict normalized checks.
  const tails = [...candidates]
    .map((c) => c.slice(-9))
    .filter((t) => t.length >= 7);
  const uniqueTails = [...new Set(tails)].slice(0, 6);

  let query = supabase
    .from("owners")
    .select("id, first_name, last_name, member_type, wallet_balance, phone")
    .limit(100);

  if (uniqueTails.length) {
    const orParts = uniqueTails.map((t) => `phone.ilike.%${t}%`);
    query = query.or(orParts.join(","));
  }

  const { data: owners, error } = await query;
  if (error || !owners?.length) return null;

  const matched = owners.find((o) => phoneLikelyMatches(normalizeDigits(o.phone), candidates));
  return matched ?? null;
}

function historyFallbackOwnerProfile(phone, history) {
  const userLines = (history ?? [])
    .filter((m) => m?.role === "user" && typeof m?.content === "string")
    .map((m) => m.content)
    .slice(-12);

  const joined = userLines.join("\n");
  const nameMatch = joined.match(
    /\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,40})/i
  );
  const petHints = userLines
    .filter((line) => /\b(dog|cat|pet|pets|puppy|kitten)\b/i.test(line))
    .slice(-4);

  const lines = [`Unknown owner (phone: ${phone})`];
  if (nameMatch?.[1]) {
    lines.push(`Possible name from chat: ${nameMatch[1].trim()}`);
  }
  if (petHints.length) {
    lines.push("Recent pet-related messages:");
    for (const hint of petHints) {
      lines.push(`- ${hint.slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

function buildHandoffPayload(history) {
  const userMessages = (history ?? [])
    .filter((m) => m?.role === "user" && typeof m?.content === "string")
    .map((m) => m.content.trim())
    .filter(Boolean);

  return {
    source: "whatsapp_recent_history",
    pending_request: userMessages.at(-1) ?? "",
    salient_user_points: userMessages.slice(-5),
    captured_at: new Date().toISOString(),
  };
}

function extractName(text) {
  if (!text) return null;
  const match = text.match(/\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,40})/i);
  return match?.[1]?.trim() ?? null;
}

function extractConversationFacts(existingFacts, history, latestUserMessage, handoff) {
  const userMessages = (history ?? [])
    .filter((m) => m?.role === "user" && typeof m?.content === "string")
    .map((m) => m.content);
  if (latestUserMessage) userMessages.push(latestUserMessage);

  const possibleName = extractName(userMessages.join("\n")) ?? existingFacts?.possible_name ?? null;
  const petMentions = userMessages
    .filter((line) => /\b(dog|cat|pet|pets|puppy|kitten)\b/i.test(line))
    .slice(-6);

  return {
    ...(existingFacts ?? {}),
    possible_name: possibleName,
    pet_mentions: petMentions,
    open_intent: handoff?.pending_request ?? userMessages.at(-1) ?? existingFacts?.open_intent ?? null,
    last_user_message: latestUserMessage ?? existingFacts?.last_user_message ?? null,
    context_source: handoff ? "handoff" : existingFacts?.context_source ?? "ongoing_chat",
    last_updated_at: new Date().toISOString(),
  };
}

function summarizeToolResult(result) {
  if (result?.error) return `error=${result.error}`;
  if (Array.isArray(result)) return `rows=${result.length}`;
  if (result && typeof result === "object") {
    if (result.row_count !== undefined) return `rows=${result.row_count}`;
    if (result.message) return String(result.message).slice(0, 120);
  }
  return String(result).slice(0, 120);
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

async function ensureConversationFactsColumn() {
  try {
    await supabase.rpc("execute_sql", {
      query: `
        ALTER TABLE agent_conversations
          ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}'::jsonb;
      `,
    });
  } catch {
    // Ignore startup migration errors (including column already existing).
  }
}

async function ensureSessionBucketAccess() {
  const { error } = await supabase.storage.from(SESSION_BUCKET).list("", { limit: 1 });
  if (error) {
    throw new Error(
      `Cannot access Supabase storage bucket '${SESSION_BUCKET}': ${error.message}`
    );
  }
}

function queueClientInitialize(trigger) {
  if (isShuttingDown) {
    console.log("Client initialize skipped (shutdown in progress):", trigger);
    return;
  }
  if (isClientInitializing) {
    console.log("Client initialize skipped (already running):", trigger);
    return;
  }
  isClientInitializing = true;
  isClientReady = false;
  clearInitGuardTimer();
  armReadyStallTimer(trigger);
  console.log("Client initialize requested:", trigger);
  initGuardTimer = setTimeout(() => {
    if (isClientInitializing) {
      void scheduleAutoRecover(`initialize-guard-timeout:${trigger}`);
    }
  }, INIT_GUARD_TIMEOUT_MS);

  client
    .initialize()
    .catch((err) => {
      console.error("Client initialize failed:", err?.message ?? err);
      void scheduleAutoRecover(`initialize-error:${trigger}`);
    })
    .finally(() => {
      clearInitGuardTimer();
      isClientInitializing = false;
    });
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Graceful shutdown start (${signal})`);
  try {
    await client.destroy();
    console.log("WhatsApp client destroyed cleanly");
  } catch (err) {
    console.error("Error during WhatsApp client shutdown:", err?.message ?? err);
  } finally {
    process.exit(0);
  }
}

async function getOwnerContext(phone, conv) {
  let ownerId = conv?.owner_id ?? null;
  let ownerMatchSource = "conversation_owner_id";

  if (!ownerId) {
    const owner = await findOwnerByFlexiblePhone(phone);
    if (owner?.id) {
      ownerId = owner.id;
      ownerMatchSource = "flexible_phone_match";
      await supabase
        .from("agent_conversations")
        .update({ owner_id: owner.id })
        .eq("phone_number", phone);
    } else {
      ownerMatchSource = "no_owner_match";
    }
  }

  let ownerProfile = "Unknown owner (phone: " + phone + ")";
  if (conv?.owner_profile && ownerId) {
    ownerProfile = conv.owner_profile;
    ownerMatchSource = `${ownerMatchSource}+cached_profile`;
  } else {
    ownerProfile = await buildOwnerProfile(ownerId, phone);
    if (ownerProfile.startsWith("Unknown owner")) {
      ownerProfile = historyFallbackOwnerProfile(phone, conv?.history ?? []);
      ownerMatchSource = `${ownerMatchSource}+history_fallback`;
    } else {
      ownerMatchSource = `${ownerMatchSource}+db_profile`;
    }
    await supabase
      .from("agent_conversations")
      .update({ owner_profile: ownerProfile, owner_id: ownerId })
      .eq("phone_number", phone);
  }

  console.log("Owner context source:", { phone, owner_id: ownerId, source: ownerMatchSource });
  return { ownerId, ownerProfile, ownerMatchSource };
}

async function fetchFormattedHistoryByChatId(chatId, limit = 20) {
  const chat = await client.getChatById(chatId);
  const recentMsgs = await chat.fetchMessages({ limit });
  console.log("History fetched:", recentMsgs.length, "messages");
  return recentMsgs
    .filter((m) => {
      const body = m.body?.trim();
      if (!body) return false;
      if (m.isStatus) return false;
      if (m.type === "revoked" || m.type === "revoked_ack") return false;
      if (/^!(bot|human)\b/i.test(body)) return false;
      return true;
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .map((m) => ({
      role: m.fromMe ? "assistant" : "user",
      content: m.body,
    }));
}

async function prepareBotActivationContext(targetJid, targetPhone) {
  let formattedHistory = [];
  try {
    formattedHistory = await fetchFormattedHistoryByChatId(targetJid, 20);
    console.log(
      "Formatted history:",
      formattedHistory.map((m) => m.role + ": " + m.content.slice(0, 40))
    );
  } catch (e) {
    console.error("History fetch failed:", e.message);
  }

  const owner = await findOwnerByFlexiblePhone(targetPhone);
  const ownerProfile = await buildOwnerProfile(owner?.id ?? null, targetPhone);
  const handoff = buildHandoffPayload(formattedHistory);
  const facts = extractConversationFacts({}, formattedHistory, handoff.pending_request, handoff);

  return {
    ownerId: owner?.id ?? null,
    ownerProfile,
    formattedHistory,
    handoff,
    facts,
  };
}

async function activateAgentForTarget({
  triggerSource,
  targetJid,
  notifyTemplate,
}) {
  const normalizedTargetJid = (targetJid ?? "").replace(/\s/g, "");
  const targetPhone = canonicalConversationPhone(normalizedTargetJid);
  console.log("Activating agent for:", {
    triggerSource,
    targetJid: normalizedTargetJid,
    targetPhone,
  });

  await supabase
    .from("agent_conversations")
    .upsert({ phone_number: targetPhone, mode: "agent" });

  const {
    ownerId,
    ownerProfile,
    formattedHistory,
    handoff,
    facts,
  } = await prepareBotActivationContext(normalizedTargetJid, targetPhone);

  let conversationKey = targetPhone;
  if (ownerId) {
    const { data: ownerConv } = await supabase
      .from("agent_conversations")
      .select("phone_number")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ownerConv?.phone_number) {
      conversationKey = ownerConv.phone_number;
    }
  }

  await supabase.from("agent_conversations").upsert(
    {
      phone_number: conversationKey,
      owner_id: ownerId,
      mode: "agent",
      history: formattedHistory,
      owner_profile: ownerProfile,
      facts,
    },
    { onConflict: "phone_number" }
  );

  if (ownerId) {
    await supabase
      .from("agent_conversations")
      .update({ mode: "agent" })
      .eq("owner_id", ownerId);
  }

  const greeting = await runAgent(
    conversationKey,
    "[SYSTEM: You have just been connected to this conversation. Review the chat history and greet the owner by name, acknowledging what they were asking about. Be warm and brief.]",
    { handoff }
  );
  await client.sendMessage(normalizedTargetJid, greeting);
  if (notifyTemplate) {
    await notifyStaff(notifyTemplate(conversationKey));
  }
  return { targetPhone: conversationKey, targetJid: normalizedTargetJid };
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
async function runAgent(phone, message, options = {}) {
  let { data: conv } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("phone_number", phone)
    .single();

  if (!conv) {
    const { data: newConv } = await supabase
      .from("agent_conversations")
      .insert({
        phone_number: phone,
        owner_id: null,
        mode: "agent",
        history: [],
        facts: {},
      })
      .select()
      .single();

    conv = newConv;
  }

  const history = conv?.history ?? [];
  const { ownerProfile, ownerMatchSource } = await getOwnerContext(phone, conv);
  const updatedFacts = extractConversationFacts(conv?.facts, history, message, options.handoff);
  if (options.handoff?.pending_request) {
    console.log("First-turn handoff source:", {
      phone,
      source: "handoff",
      ownerMatchSource,
      pending_request: options.handoff.pending_request.slice(0, 120),
    });
  }

  const incoming = { role: "user", content: message };
  const claudeMessages = [...history, incoming];
  const systemPrompt = await buildSystemPrompt(ownerProfile, {
    handoff: options.handoff,
    facts: updatedFacts,
  });

  let currentMessages = [...claudeMessages];
  let finalText = "";
  const toolTrace = [];
  let toolRounds = 0;

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
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        finalText =
          "I have enough context to help, but I need a teammate to complete this request. Let me hand this to our team.";
        toolTrace.push("tool_round_limit_reached");
        break;
      }
      toolRounds += 1;
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolBlocks.map(async (block) => {
          const toolOutput = await executeTool(block.name, block.input, phone);
          toolTrace.push(`${block.name}: ${summarizeToolResult(toolOutput)}`);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolOutput),
          };
        })
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

  const memoryBlocks = [];
  if (options.handoff?.pending_request) {
    memoryBlocks.push(`handoff_pending_request=${options.handoff.pending_request.slice(0, 200)}`);
  }
  if (toolTrace.length) {
    memoryBlocks.push(`tool_trace=${toolTrace.join(" | ").slice(0, 600)}`);
  }

  const updatedHistory = [
    ...claudeMessages,
    ...(memoryBlocks.length
      ? [{ role: "assistant", content: `[MEMORY]\n${memoryBlocks.join("\n")}` }]
      : []),
    { role: "assistant", content: finalText },
  ].slice(-30);

  await supabase
    .from("agent_conversations")
    .update({ history: updatedHistory, facts: updatedFacts })
    .eq("phone_number", phone);

  return finalText;
}

// SECTION 8 - MESSAGE HANDLERS
client.on("message", async (msg) => {
  if (msg.isStatus) return;
  if (msg.from.endsWith("@newsletter")) return;
  if (msg.from.endsWith("@broadcast")) return;
  const messageBody = typeof msg.body === "string" ? msg.body : "";
  console.log("Message received:", msg.from, "|", messageBody.slice(0, 50));

  const isFromStaffGroup = STAFF_GROUP && msg.from === STAFF_GROUP;

  if (isFromStaffGroup) {
    const text = messageBody.trim();

    if (text.startsWith("!bot ")) {
      const rawNumber = text.slice(5).trim();
      const targetJid = await resolveTargetJidForActivation(rawNumber);
      await activateAgentForTarget({
        triggerSource: "staff_group_command",
        targetJid,
        notifyTemplate: (targetPhone) => `✓ Agent mode ON for ${targetPhone}`,
      });
      return;
    }

    if (text.startsWith("!human ")) {
      const rawTarget = text.slice(7).trim();
      const targetPhone = canonicalConversationPhone(rawTarget);
      const owner = await findOwnerByFlexiblePhone(targetPhone);
      if (owner?.id) {
        await supabase
          .from("agent_conversations")
          .update({ mode: "human" })
          .eq("owner_id", owner.id);
      } else {
        await supabase
          .from("agent_conversations")
          .update({ mode: "human" })
          .eq("phone_number", targetPhone);
      }
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

  if (!msg.from.endsWith("@c.us") && !msg.from.endsWith("@lid")) return;

  const routing = await resolveInboundRouting(msg);
  const lookupCandidates = [...new Set(routing.lookupCandidates ?? [routing.conversationPhone])];
  let mode = "human";
  let modeKey = routing.conversationPhone;
  let resolvedOwnerId = null;
  let humanModeKey = null;

  // Prefer owner_id as the source of truth when we can resolve owner.
  const ownerFromReply = await findOwnerByFlexiblePhone(routing.replyTarget);
  const ownerFromConversation = ownerFromReply ?? (await findOwnerByFlexiblePhone(routing.conversationPhone));
  if (ownerFromConversation?.id) {
    resolvedOwnerId = ownerFromConversation.id;
    const { data: ownerConvs } = await supabase
      .from("agent_conversations")
      .select("phone_number, mode, updated_at")
      .eq("owner_id", ownerFromConversation.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    for (const conv of ownerConvs ?? []) {
      if (conv?.mode === "agent") {
        mode = "agent";
        modeKey = conv.phone_number;
        break;
      }
      if (conv?.mode === "human" && !humanModeKey) {
        humanModeKey = conv.phone_number;
      }
    }
  }

  if (mode !== "agent") {
  for (const candidate of lookupCandidates) {
    const { data: conv } = await supabase
      .from("agent_conversations")
      .select("mode")
      .eq("phone_number", candidate)
      .single();
    if (!conv?.mode) continue;
    if (conv.mode === "agent") {
      mode = "agent";
      modeKey = candidate;
      break;
    }
    if (conv.mode === "human" && !humanModeKey) {
      humanModeKey = candidate;
    }
  }
  }
  if (mode !== "agent" && humanModeKey) {
    mode = "human";
    modeKey = humanModeKey;
  }
  console.log("Inbound routing:", {
    from: msg.from,
    conversationPhone: routing.conversationPhone,
    replyTarget: routing.replyTarget,
    ownerId: resolvedOwnerId,
    modeKey,
    mode,
  });
  if (mode !== "agent") return;
  const activeConversationKey = modeKey;

  try {
    console.log("Agent reply pipeline start:", activeConversationKey);
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await runAgent(activeConversationKey, messageBody);

    await chat.clearState();
    await client.sendMessage(routing.replyTarget, reply);
    console.log("Agent reply pipeline complete:", activeConversationKey);
    agentErrorCounts.delete(activeConversationKey);
  } catch (err) {
    console.error("Agent error:", err);
    await client.sendMessage(
      routing.replyTarget,
      "Sorry, something went wrong. Let me get someone to help you."
    );
    const nextErrorCount = (agentErrorCounts.get(activeConversationKey) ?? 0) + 1;
    agentErrorCounts.set(activeConversationKey, nextErrorCount);

    if (nextErrorCount >= MAX_CONSECUTIVE_AGENT_ERRORS) {
      await supabase
        .from("agent_conversations")
        .update({ mode: "human" })
        .eq("phone_number", modeKey);
      if (resolvedOwnerId) {
        await supabase
          .from("agent_conversations")
          .update({ mode: "human" })
          .eq("owner_id", resolvedOwnerId);
      }
      agentErrorCounts.delete(activeConversationKey);
      await notifyStaff(
        `⚠️ Agent error for ${activeConversationKey}\n${err.message}\nReached ${MAX_CONSECUTIVE_AGENT_ERRORS} consecutive failures and switched to human mode`
      );
    } else {
      await notifyStaff(
        `⚠️ Agent transient error for ${activeConversationKey} (${nextErrorCount}/${MAX_CONSECUTIVE_AGENT_ERRORS})\n${err.message}`
      );
    }
  }
});

client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  if (msg.from === msg.to) return;
  if (msg.to.endsWith("@g.us")) return;

  const text = msg.body.trim().toLowerCase();

  if (text === "!bot") {
    await msg.delete(true);
    await activateAgentForTarget({
      triggerSource: "direct_chat_command",
      targetJid: msg.to,
      notifyTemplate: (targetPhone) => `🤖 Agent activated for ${targetPhone}`,
    });
    return;
  }

  if (text === "!human") {
    await msg.delete(true);
    const targetPhone = canonicalConversationPhone(msg.to);
    const owner = await findOwnerByFlexiblePhone(targetPhone);
    if (owner?.id) {
      await supabase
        .from("agent_conversations")
        .update({ mode: "human" })
        .eq("owner_id", owner.id);
    } else {
      await supabase
        .from("agent_conversations")
        .update({ mode: "human" })
        .eq("phone_number", targetPhone);
    }
    await notifyStaff(`👤 Human mode for ${targetPhone}`);
    return;
  }
});

// SECTION 9 - START
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (_req, res) => {
  if (!latestQR) {
    return res.send(
      "<h2>No QR code yet -- agent may already be connected. Refresh in a few seconds.</h2>"
    );
  }
  const imgData = await QRCode.toDataURL(latestQR);
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#fff;flex-direction:column">
        <h2>Scan with WhatsApp</h2>
        <img src="${imgData}" style="width:300px;height:300px"/>
        <p>WhatsApp → Settings → Linked Devices → Link a Device</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log("QR server running on port", PORT);
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

console.log("Starting MSH WhatsApp agent...");
await ensureSessionBucketAccess();
await ensureOwnerProfileColumn();
await ensureConversationFactsColumn();
queueClientInitialize("startup");
