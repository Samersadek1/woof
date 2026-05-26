// WhatsApp agent entry point. Orchestrates tenant config, WhatsApp runtime,
// conversation/owner resolution, the agent runner, and the message handlers.
// All real logic lives in ./lib/*; this file is wiring + event registration.

import pkg from "whatsapp-web.js";
const { Client, RemoteAuth } = pkg;

import Anthropic from "@anthropic-ai/sdk";
import QRCode from "qrcode";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ws from "ws";

import { loadTenant, getFallbackString as readFallback } from "./lib/tenant.js";
import { buildToolDefinitions, buildToolConfigMap, createToolExecutor } from "./lib/tools.js";
import { evaluateTenantBudget } from "./lib/cost.js";
import { withChatLock } from "./lib/queue.js";
import { logAgentEvent } from "./lib/turns.js";
import { STATES, recordStateTransition } from "./lib/state.js";
import { canonicalConversationPhone, extractStaffRoutePhone } from "./lib/identity.js";
import { createWhatsAppChannel } from "./lib/channels/whatsapp.js";
import { createOwnerResolver } from "./lib/owners.js";
import { createConversationStore } from "./lib/conversation.js";
import {
  createAgentRunner,
  buildOwnerProfileFromOwnerId,
} from "./lib/agent.js";
import { createActivation } from "./lib/activation.js";
import { createWaRuntime } from "./lib/runtime.js";
import { bootstrapAgentSchema } from "./lib/db-bootstrap.js";
import * as factsLib from "./lib/facts.js";
import {
  BRIDGE_SECRET_HEADER,
  fetchCompanyChatReply,
  formatE164Phone,
  getConnectedBusinessPhone,
  verifyBridgeTargetSecret,
} from "./lib/company-chat-bridge.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TENANT_SLUG = process.env.TENANT_SLUG || "woof";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
  );
}
if (!ANTHROPIC_API_KEY) {
  throw new Error("Missing Anthropic config. Set ANTHROPIC_API_KEY.");
}

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-4-6";
const MAX_TOK = Number(process.env.AGENT_MAX_TOKENS ?? 1024);
const MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS ?? 4);
// Used for the small one-shot summarizer that turns escalations into
// receptionist-friendly English. Cheaper/faster than the main MODEL on purpose.
const NARRATIVE_MODEL =
  process.env.AGENT_NARRATIVE_MODEL || "claude-3-5-haiku-latest";
const MAX_CONSECUTIVE_AGENT_ERRORS = 3;
const SESSION_BUCKET = "whatsapp-sessions";

let STAFF_GROUP = process.env.STAFF_GROUP_ID;
let WA_SESSION_CLIENT_ID =
  process.env.WA_SESSION_CLIENT_ID || `${TENANT_SLUG}-whatsapp-main`;

// ---------------------------------------------------------------------------
// Tenant context (populated by loadTenantContext at startup)
// ---------------------------------------------------------------------------
const tenantCtx = {
  tenant: null,
  prompt: null,
  tools: [],
  toolDefs: [],
  toolConfig: new Map(),
  businessRules: "",
  schemaCache: null,
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function loadTenantContext() {
  const ctx = await loadTenant(supabase, TENANT_SLUG);
  tenantCtx.tenant = ctx.tenant;
  tenantCtx.prompt = ctx.prompt;
  tenantCtx.tools = ctx.tools;
  tenantCtx.businessRules = ctx.businessRules;
  tenantCtx.toolDefs = buildToolDefinitions(ctx.tools);
  tenantCtx.toolConfig = buildToolConfigMap(ctx.tools);

  if (!STAFF_GROUP && ctx.tenant.staff_group_id) STAFF_GROUP = ctx.tenant.staff_group_id;
  if (!process.env.WA_SESSION_CLIENT_ID && ctx.tenant.wa_session_client_id) {
    WA_SESSION_CLIENT_ID = ctx.tenant.wa_session_client_id;
  }

  console.log("Tenant loaded:", {
    slug: ctx.tenant.slug,
    display_name: ctx.tenant.display_name,
    tools: tenantCtx.toolDefs.map((t) => t.name),
    daily_token_cap: ctx.tenant.daily_token_cap ?? null,
  });
}

const fallback = (key) =>
  readFallback(
    tenantCtx.prompt,
    key,
    {
      fallback_processing:
        "Thanks - I have your details and I am still processing this request. I will confirm the next step shortly.",
      fallback_repeat: "Thanks - I am still on this and will update you shortly.",
      fallback_error: "Sorry, something went wrong. Let me get someone to help you.",
    }[key],
  );

// ---------------------------------------------------------------------------
// WhatsApp client + RemoteAuth store
// ---------------------------------------------------------------------------
const sessionObjectPath = (session) => `${session}.zip`;
const localSessionZipPath = (session) => resolve(".wwebjs_auth", `${session}.zip`);

const store = {
  async sessionExists({ session }) {
    const { data, error } = await supabase.storage
      .from(SESSION_BUCKET)
      .list("", { search: sessionObjectPath(session) });
    if (error) throw new Error(`Session check failed: ${error.message}`);
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
      console.log("RemoteAuth save success:", { session, bytes: payload.length });
    } catch (e) {
      // Non-fatal: keep the bot online even if remote backup fails.
      console.error("RemoteAuth save failed (non-fatal):", { session, error: e.message });
    }
  },

  async extract({ session, path }) {
    const targetPath = path ?? localSessionZipPath(session);
    const { data, error } = await supabase.storage
      .from(SESSION_BUCKET)
      .download(sessionObjectPath(session));
    if (error) throw new Error(`Session extract failed: ${error.message}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
    console.log("RemoteAuth extract success:", { session, bytes: bytes.length });
  },

  async delete({ session }) {
    const { error } = await supabase.storage
      .from(SESSION_BUCKET)
      .remove([sessionObjectPath(session)]);
    if (error) throw new Error(`Session delete failed: ${error.message}`);
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
    backupSyncIntervalMs: 300_000,
  }),
  puppeteer: puppeteerConfig,
});

const channel = createWhatsAppChannel({ client, getStaffGroup: () => STAFF_GROUP });

const runtime = createWaRuntime({
  client,
  store,
  getSessionId: () => WA_SESSION_CLIENT_ID,
  localSessionPath: localSessionZipPath,
  getDisplayName: () => tenantCtx.tenant?.display_name ?? "WhatsApp",
  config: {
    initGuardMs: Number(process.env.WA_INIT_GUARD_TIMEOUT_MS ?? 120_000),
    readyStallMs: Number(process.env.WA_READY_STALL_TIMEOUT_MS ?? 180_000),
    authToReadyMs: Number(process.env.WA_AUTH_TO_READY_TIMEOUT_MS ?? 60_000),
    maxRecoveryRetries: Number(process.env.WA_MAX_AUTO_RECOVERY_RETRIES ?? 2),
  },
  onListGroupsAtBoot: async () => {
    if (STAFF_GROUP) {
      console.log("Staff group:", STAFF_GROUP);
      return;
    }
    console.log("STAFF_GROUP_ID not set -- listing groups so it can be configured:");
    const chats = await client.getChats();
    for (const g of chats.filter((c) => c.isGroup)) {
      console.log(`${g.name}: ${g.id._serialized}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Service container (built after tenant load)
// ---------------------------------------------------------------------------
const ownerResolver = createOwnerResolver({ supabase, client });
const conversation = createConversationStore({ supabase, client, ownerResolver });

const executeTool = createToolExecutor({
  supabase,
  notifyStaff: (msg) => channel.notifyStaff(msg),
  logEvent: (payload) => logAgentEvent(supabase, payload),
  setAwaitingStaffDirection: conversation.setAwaitingStaffDirection,
  getToolConfig: (name) => tenantCtx.toolConfig.get(name) ?? null,
  getSchemaCache: () => tenantCtx.schemaCache,
  getTenantId: () => tenantCtx.tenant?.id ?? null,
  anthropic,
  getNarrativeModel: () => NARRATIVE_MODEL,
});

const agent = createAgentRunner({
  supabase,
  anthropic,
  model: MODEL,
  maxTokens: MAX_TOK,
  maxToolRounds: MAX_TOOL_ROUNDS,
  getTenant: () => tenantCtx.tenant,
  getPrompt: () => tenantCtx.prompt,
  getBusinessRules: () => tenantCtx.businessRules,
  getToolDefinitions: () => tenantCtx.toolDefs,
  getSchemaReference: () => tenantCtx.schemaCache?.reference ?? "",
  getFallbackString: fallback,
  executeTool,
  ownerResolver,
  conversation,
  facts: factsLib,
});

const activation = createActivation({
  supabase,
  channel,
  ownerResolver,
  conversation,
  facts: factsLib,
  runAgent: agent.runAgent,
  buildOwnerProfile: (ownerId, phone) => buildOwnerProfileFromOwnerId(supabase, ownerId, phone),
  getTenantId: () => tenantCtx.tenant?.id ?? null,
  notifyStaff: (msg) => channel.notifyStaff(msg),
});

// ---------------------------------------------------------------------------
// Staff group commands
// ---------------------------------------------------------------------------
async function setHumanModeForTarget(targetPhone, ownerId, reasonLabel) {
  // Collect every conversation row that "is" this target -- the literal phone,
  // any row that lists it in facts.aliases, any row whose facts.active_jid is
  // it, and (when we have one) every row sharing the owner_id. Then flip mode
  // + agent_assigned on all of them. This was missing before: !human only
  // touched the literal phone row, leaving @lid alias rows in agent mode.
  const phones = new Set([targetPhone]);
  const ownerIds = new Set();
  if (ownerId) ownerIds.add(ownerId);

  const { data: literalRow } = await supabase
    .from("agent_conversations")
    .select("phone_number, owner_id, facts")
    .eq("phone_number", targetPhone)
    .maybeSingle();
  if (literalRow?.owner_id) ownerIds.add(literalRow.owner_id);

  const { data: activeJidRows } = await supabase
    .from("agent_conversations")
    .select("phone_number, owner_id, facts")
    .eq("facts->>active_jid", targetPhone);
  for (const row of activeJidRows ?? []) {
    if (row?.phone_number) phones.add(row.phone_number);
    if (row?.owner_id) ownerIds.add(row.owner_id);
  }

  const { data: aliasRows } = await supabase
    .from("agent_conversations")
    .select("phone_number, owner_id, facts")
    .contains("facts", { aliases: [targetPhone] });
  for (const row of aliasRows ?? []) {
    if (row?.phone_number) phones.add(row.phone_number);
    if (row?.owner_id) ownerIds.add(row.owner_id);
  }

  if (ownerIds.size) {
    const { data: ownerRows } = await supabase
      .from("agent_conversations")
      .select("phone_number, facts")
      .in("owner_id", [...ownerIds]);
    for (const row of ownerRows ?? []) {
      if (row?.phone_number) phones.add(row.phone_number);
    }
  }

  // #region debug log H3
  const _h3discovered = {targetPhone,ownerIdHint:ownerId,phones:[...phones],ownerIds:[...ownerIds],reason:reasonLabel};
  console.log("[DEBUG H3] setHumanModeForTarget discovered:", JSON.stringify(_h3discovered));
  fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'299bd9'},body:JSON.stringify({sessionId:'299bd9',hypothesisId:'H3',location:'index.js:setHumanModeForTarget',message:'discovered targets',data:_h3discovered,timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // Read the current facts blob for each row so the agent_assigned flip
  // doesn't blow away unrelated keys.
  const { data: currentRows } = await supabase
    .from("agent_conversations")
    .select("phone_number, facts")
    .in("phone_number", [...phones]);

  const stamp = new Date().toISOString();
  for (const row of currentRows ?? []) {
    await supabase
      .from("agent_conversations")
      .update({
        mode: "human",
        state: STATES.HUMAN,
        facts: {
          ...(row?.facts ?? {}),
          agent_assigned: false,
          agent_assignment_updated_at: stamp,
        },
      })
      .eq("phone_number", row.phone_number);
  }

  // Also clear the cached agent_assigned flag for any owner rows we touched
  // that didn't have an existing conv row (defensive, no-op if nothing found).
  for (const id of ownerIds) {
    await conversation.setOwnerAgentAssignment(id, false);
  }

  await recordStateTransition(supabase, {
    tenantId: tenantCtx.tenant?.id ?? null,
    chatId: targetPhone,
    fromState: STATES.AGENT,
    toState: STATES.HUMAN,
    reason: reasonLabel,
  });

  // #region debug log H3
  const _h3done = {targetPhone,phones:[...phones],ownerIds:[...ownerIds],rowsUpdated:currentRows?.length ?? 0};
  console.log("[DEBUG H3] setHumanModeForTarget done:", JSON.stringify(_h3done));
  fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'299bd9'},body:JSON.stringify({sessionId:'299bd9',hypothesisId:'H3',location:'index.js:setHumanModeForTarget:done',message:'flipped to human',data:_h3done,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

async function notifyOwnerByOwnerId(ownerId, message) {
  if (!ownerId) return;
  const { data: conv } = await supabase
    .from("agent_conversations")
    .select("phone_number")
    .eq("owner_id", ownerId)
    .single();
  if (conv?.phone_number) {
    await channel.sendMessage(conv.phone_number, message);
  }
}

// Maps a booking_ref prefix to (table, columns, owner-message-builder).
function bookingTargetFor(ref) {
  if (ref.startsWith("P-")) {
    return null;
  }
  return {
    table: "bookings",
    cancelColumn: "cancelled_reason",
    selectCols: "id, booking_ref, check_in_date, check_out_date, owner_id",
    buildOwnerMessage: (row) =>
      `Great news! Your booking ${row.booking_ref} is confirmed ✓\n` +
      `Check-in: ${row.check_in_date}\n` +
      `Check-out: ${row.check_out_date}\n\nSee you then!`,
  };
}

async function reactivateOwnerAgent(ownerId, extraUpdate = {}) {
  if (!ownerId) return;
  await supabase
    .from("agent_conversations")
    .update({ mode: "agent", ...extraUpdate })
    .eq("owner_id", ownerId);
  await conversation.setOwnerAgentAssignment(ownerId, true);
}

async function handleStaffConfirmCommand(text) {
  const ref = text.slice(9).trim().toUpperCase();
  const target = bookingTargetFor(ref);
  if (!target) {
    await channel.notifyStaff(`✗ ${ref} is not a supported booking type (park visits are retired).`);
    return;
  }

  const { data: row } = await supabase
    .from(target.table)
    .update({ status: "confirmed" })
    .eq("booking_ref", ref)
    .eq("status", "draft")
    .select(target.selectCols)
    .single();
  if (!row) {
    await channel.notifyStaff(`✗ Could not confirm ${ref} -- not found or not a draft`);
    return;
  }

  await notifyOwnerByOwnerId(row.owner_id, target.buildOwnerMessage(row));
  await reactivateOwnerAgent(row.owner_id, { draft_booking: null });
  await channel.notifyStaff(`✓ ${ref} confirmed and owner notified`);
}

async function handleStaffRejectCommand(text) {
  const parts = text.slice(8).trim().split(" ");
  const ref = parts[0].toUpperCase();
  const reason = parts.slice(1).join(" ") || "No reason given";
  const target = bookingTargetFor(ref);
  if (!target) {
    await channel.notifyStaff(`✗ ${ref} is not a supported booking type (park visits are retired).`);
    return;
  }

  const { data: row } = await supabase
    .from(target.table)
    .update({ status: "cancelled", [target.cancelColumn]: reason })
    .eq("booking_ref", ref)
    .eq("status", "draft")
    .select("owner_id")
    .single();
  const ownerId = row?.owner_id ?? null;

  if (ownerId) {
    await notifyOwnerByOwnerId(
      ownerId,
      `I'm sorry, we weren't able to confirm that booking. ` +
        `${reason}. Please get in touch and we'll find another option.`,
    );
    await reactivateOwnerAgent(ownerId);
  }
  await channel.notifyStaff(`✓ ${ref} cancelled and owner notified`);
}

async function handleStaffGroupMessage(msg) {
  const text = (msg.body ?? "").trim();
  const isCommand = text.startsWith("!");

  if (!isCommand && msg.hasQuotedMsg) {
    try {
      const quoted = await msg.getQuotedMessage();
      const routePhone = quoted?.fromMe ? extractStaffRoutePhone(quoted?.body ?? "") : null;
      if (routePhone) {
        await activation.handleStaffGuidanceReply({ routePhone, guidanceText: text });
        return;
      }
    } catch (err) {
      console.error("Staff guidance reply handling failed:", err?.message ?? err);
    }
  }

  if (text.startsWith("!bot ")) {
    const targetJid = await activation.resolveTargetJidForActivation(text.slice(5).trim());
    await activation.activateAgentForTarget({
      triggerSource: "staff_group_command",
      targetJid,
      notifyTemplate: (targetPhone) => `✓ Agent mode ON for ${targetPhone}`,
    });
    return;
  }

  if (text.startsWith("!human ")) {
    const targetPhone = canonicalConversationPhone(text.slice(7).trim());
    const owner = await ownerResolver.findOwnerByFlexiblePhone(targetPhone);
    await setHumanModeForTarget(targetPhone, owner?.id ?? null, "staff_command:!human");
    await channel.notifyStaff(`✓ Human mode ON for ${targetPhone}`);
    return;
  }

  if (text.startsWith("!confirm ")) await handleStaffConfirmCommand(text);
  else if (text.startsWith("!reject ")) await handleStaffRejectCommand(text);
}

// ---------------------------------------------------------------------------
// Inbound message handler (owner -> bot)
// ---------------------------------------------------------------------------
const agentErrorCounts = new Map();

async function handleOwnerInboundMessage(msg) {
  const messageBody = typeof msg.body === "string" ? msg.body : "";
  const routing = await conversation.resolveInboundRouting(msg);
  const ownerResolution = await conversation.resolveOwnerConversationForInbound(routing);

  let resolvedOwnerId = ownerResolution?.ownerId ?? routing.ownerIdHint ?? null;
  let ownerConv = ownerResolution?.ownerConv ?? null;
  let resolutionSource = ownerResolution?.source ?? routing.source;

  if (resolvedOwnerId) {
    if (!ownerConv) ownerConv = await conversation.getOwnerConversation(resolvedOwnerId);
    if (!ownerConv) {
      const defaultKey = routing.conversationPhone || routing.replyTarget;
      // Known owner, no existing conv row: default to HUMAN mode. Staff must
      // explicitly !bot to activate the agent. Previously this hardcoded
      // mode:'agent', which made the bot auto-reply to any known owner the
      // first time they messaged from a new JID -- bypassing the activation
      // requirement entirely.
      await supabase.from("agent_conversations").upsert(
        {
          phone_number: defaultKey,
          owner_id: resolvedOwnerId,
          mode: "human",
          state: STATES.HUMAN,
          history: [],
          facts: {},
        },
        { onConflict: "phone_number" },
      );
      ownerConv = await conversation.getOwnerConversation(resolvedOwnerId);
      resolutionSource = `${resolutionSource}+owner_row_created_human`;
      // #region debug log H6
      const _h6 = {from:msg.from,defaultKey,ownerId:resolvedOwnerId,resolutionSource};
      console.log("[DEBUG H6] auto-created conv row in HUMAN mode for known owner:", JSON.stringify(_h6));
      fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'299bd9'},body:JSON.stringify({sessionId:'299bd9',hypothesisId:'H6',location:'index.js:owner_row_created',message:'auto-created conv row defaulted to human',data:_h6,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    ownerConv = await conversation.recordActiveJidForOwner({
      ownerId: resolvedOwnerId,
      ownerConv,
      inboundJid: msg.from,
      inboundTs: msg.timestamp,
      aliases: [routing.replyTarget, routing.conversationPhone],
    });
    resolutionSource = `${resolutionSource}+active_jid_updated`;
  }

  let mode = "human";
  let modeKey = routing.conversationPhone;

  if (ownerConv?.phone_number) {
    mode = ownerConv?.mode ?? "human";
    modeKey = ownerConv.phone_number;
    if (ownerConv?.facts?.agent_assigned === true && mode !== "agent") {
      mode = "agent";
      resolutionSource = `${resolutionSource}+agent_assigned_override`;
      // #region debug log H3
      const _h3ovr = {from:msg.from,phone:ownerConv.phone_number,storedMode:ownerConv?.mode,agentAssigned:ownerConv?.facts?.agent_assigned,assignmentUpdatedAt:ownerConv?.facts?.agent_assignment_updated_at};
      console.warn("[DEBUG H3] agent_assigned_override fired:", JSON.stringify(_h3ovr));
      fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'299bd9'},body:JSON.stringify({sessionId:'299bd9',hypothesisId:'H3',location:'index.js:agent_assigned_override',message:'override forced agent mode',data:_h3ovr,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  } else {
    // Check for a conversation row keyed on any candidate from routing -- this
    // catches the case where staff activated `!bot <c.us>` but the inbound is
    // arriving on the matching @lid that the LID bridge could not bridge.
    const candidates = Array.from(
      new Set(
        [routing.replyTarget, routing.conversationPhone, routing.contactMappedPhone].filter(
          Boolean,
        ),
      ),
    );
    const { data: candidateRows } = await supabase
      .from("agent_conversations")
      .select("phone_number, mode, facts")
      .in("phone_number", candidates)
      .order("updated_at", { ascending: false })
      .limit(5);
    const unknownConv = candidateRows?.[0] ?? null;
    if (unknownConv?.mode) {
      mode = unknownConv.mode;
      modeKey = unknownConv.phone_number ?? modeKey;
      resolutionSource = `${resolutionSource}+unknown_jid_mode_row`;
    }
  }

  console.log("Inbound routing:", {
    from: msg.from,
    conversationPhone: routing.conversationPhone,
    replyTarget: routing.replyTarget,
    ownerId: resolvedOwnerId,
    resolutionSource,
    modeKey,
    mode,
  });

  try {
    const brandPhone = getConnectedBusinessPhone(client);
    const senderKey =
      routing.conversationPhone || routing.contactMappedPhone || routing.replyTarget;
    const bridgeReply = await fetchCompanyChatReply({
      from: senderKey,
      body: messageBody,
      brandPhoneNumber: brandPhone ?? "",
    });
    if (bridgeReply) {
      await client.sendMessage(routing.replyTarget, bridgeReply);
      await logAgentEvent(supabase, {
        tenant_id: tenantCtx.tenant?.id ?? null,
        chat_id: modeKey,
        event: "outbound",
        payload: { source: "company_chat_bridge", length: bridgeReply.length },
      });
      console.log("company-chat bridge reply sent:", modeKey);
      return;
    }
  } catch (err) {
    console.warn("company-chat bridge handler error (falling through):", err?.message ?? err);
  }

  if (mode !== "agent") return;
  const activeKey = modeKey;

  // Cost circuit breaker
  if (tenantCtx.tenant?.daily_token_cap) {
    const budget = await evaluateTenantBudget(supabase, tenantCtx.tenant);
    if (budget.exceeded) {
      console.warn("Daily token cap reached; forcing human mode:", {
        tenant: tenantCtx.tenant.slug,
        used: budget.used,
        cap: budget.cap,
      });
      await supabase
        .from("agent_conversations")
        .update({ mode: "human", state: STATES.HUMAN })
        .eq("phone_number", activeKey);
      await recordStateTransition(supabase, {
        tenantId: tenantCtx.tenant.id,
        chatId: activeKey,
        fromState: STATES.AGENT,
        toState: STATES.HUMAN,
        reason: "daily_token_cap_reached",
      });
      await channel.notifyStaff(
        `⚠️ Daily token cap reached for ${tenantCtx.tenant.display_name} ` +
          `(${budget.used}/${budget.cap}). Forced human mode for ${activeKey}.`,
      );
      return;
    }
  }

  await withChatLock(activeKey, async () => {
    try {
      console.log("Agent reply pipeline start:", activeKey);
      const chat = await msg.getChat();
      await chat.sendStateTyping();
      const liveHistory = await channel.getChatHistoryFromChat(chat, 30);

      const reply = await agent.runAgent(activeKey, messageBody, {
        overrideHistory: liveHistory,
        lastSeenJid: routing.replyTarget,
        staffInstruction: ownerConv?.facts?.awaiting_staff_direction
          ? (ownerConv?.facts?.staff_instruction ??
              "Escalation is pending staff direction. Continue engaging, gather clarifications, and avoid executing transactional actions.")
          : undefined,
      });

      await chat.clearState();
      await client.sendMessage(routing.replyTarget, reply);
      await logAgentEvent(supabase, {
        tenant_id: tenantCtx.tenant?.id ?? null,
        chat_id: activeKey,
        event: "outbound",
        payload: { length: typeof reply === "string" ? reply.length : null },
      });
      console.log("Agent reply pipeline complete:", activeKey);
      agentErrorCounts.delete(activeKey);
    } catch (err) {
      console.error("Agent error:", err);
      await client.sendMessage(routing.replyTarget, fallback("fallback_error"));
      const next = (agentErrorCounts.get(activeKey) ?? 0) + 1;
      agentErrorCounts.set(activeKey, next);
      if (next >= MAX_CONSECUTIVE_AGENT_ERRORS) {
        agentErrorCounts.delete(activeKey);
        await channel.notifyStaff(
          `⚠️ Agent error for ${activeKey}\n${err.message}\n` +
            `Reached ${MAX_CONSECUTIVE_AGENT_ERRORS} consecutive failures. ` +
            `Agent mode remains ON; use !human if manual takeover is needed.`,
        );
      } else {
        await channel.notifyStaff(
          `⚠️ Agent transient error for ${activeKey} (${next}/${MAX_CONSECUTIVE_AGENT_ERRORS})\n${err.message}`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Direct chat commands (the operator typing !bot/!human in their own chat)
// ---------------------------------------------------------------------------
async function handleDirectChatCommand(msg) {
  if (!msg.fromMe || msg.from === msg.to || msg.to.endsWith("@g.us")) return;
  const text = msg.body.trim().toLowerCase();

  if (text === "!bot") {
    await msg.delete(true);
    await activation.activateAgentForTarget({
      triggerSource: "direct_chat_command",
      targetJid: msg.to,
      notifyTemplate: (targetPhone) => `🤖 Agent activated for ${targetPhone}`,
    });
    return;
  }

  if (text === "!human") {
    await msg.delete(true);
    const targetPhone = canonicalConversationPhone(msg.to);
    const owner = await ownerResolver.findOwnerByFlexiblePhone(targetPhone);
    await setHumanModeForTarget(targetPhone, owner?.id ?? null, "direct_chat_command:!human");
    await channel.notifyStaff(`👤 Human mode for ${targetPhone}`);
  }
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------
client.on("message", async (msg) => {
  if (msg.isStatus) return;
  if (msg.from.endsWith("@newsletter") || msg.from.endsWith("@broadcast")) return;
  console.log("Message received:", msg.from, "|", (msg.body ?? "").slice(0, 50));

  if (STAFF_GROUP && msg.from === STAFF_GROUP) {
    await handleStaffGroupMessage(msg);
    return;
  }

  if (!msg.from.endsWith("@c.us") && !msg.from.endsWith("@lid")) return;
  await handleOwnerInboundMessage(msg);
});

client.on("message_create", handleDirectChatCommand);

// ---------------------------------------------------------------------------
// HTTP server (QR display)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.post("/bridge/outgoing", async (req, res) => {
  const secret =
    req.headers[BRIDGE_SECRET_HEADER] ??
    req.headers["x-bridge-secret"];
  const headerValue = Array.isArray(secret) ? secret[0] : secret;
  if (!verifyBridgeTargetSecret(headerValue ?? null)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!to || !message) {
    return res.status(400).json({ error: "Expected { to, message }" });
  }

  let jid = to;
  if (!jid.includes("@")) {
    const e164 = formatE164Phone(to);
    const digits = e164 ? e164.replace(/\D/g, "") : "";
    if (!digits) {
      return res.status(400).json({ error: "Invalid to address" });
    }
    jid = `${digits}@c.us`;
  }

  try {
    await channel.sendMessage(jid, message);
    return res.json({ ok: true });
  } catch (err) {
    console.error("bridge/outgoing failed:", err?.message ?? err);
    return res.status(500).json({ error: "Send failed" });
  }
});

app.get("/", async (_req, res) => {
  const latestQR = runtime.getLatestQR();
  if (!latestQR) {
    return res.send(
      "<h2>No QR code yet -- agent may already be connected. Refresh in a few seconds.</h2>",
    );
  }
  const imgData = await QRCode.toDataURL(latestQR);
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#fff;flex-direction:column">
        <h2>Scan with WhatsApp</h2>
        <img src="${imgData}" style="width:300px;height:300px"/>
        <p>WhatsApp -> Settings -> Linked Devices -> Link a Device</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log("QR server running on port", PORT));

process.on("SIGTERM", () => void runtime.gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void runtime.gracefulShutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
console.log(`Starting WhatsApp agent (tenant=${TENANT_SLUG})...`);
await loadTenantContext();
const { schemaCache } = await bootstrapAgentSchema(supabase, { sessionBucket: SESSION_BUCKET });
tenantCtx.schemaCache = schemaCache;
runtime.queueClientInitialize("startup");
