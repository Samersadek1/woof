// Agent activation flows. Two paths in one file because they share state:
//   - activateAgentForTarget: staff turns the agent on for a chat
//   - handleStaffGuidanceReply: staff replies to a bot escalation
//   - resolveTargetJidForActivation: resolve a raw phone string to a live JID
//
// All side effects (Supabase writes, WhatsApp sends, staff notifications)
// flow through injected services so this stays testable and reusable across
// channels.

import {
  canonicalConversationPhone,
  normalizeDigits,
  phoneDigitsCandidates,
  phoneLikelyMatches,
} from "./identity.js";
import { recordStateTransition, STATES } from "./state.js";

export function createActivation({
  supabase,
  channel,
  ownerResolver,
  conversation,
  facts: factsLib,
  runAgent,
  buildOwnerProfile,
  getTenantId,
  notifyStaff,
}) {
  // Resolve a raw phone string to the live WhatsApp JID we should reach the
  // owner on. Priority:
  //   1. Owner's tracked active_jid (from inbound history).
  //   2. Newest active chat among matching JIDs in WA.
  //   3. Canonical c.us fallback.
  async function resolveTargetJidForActivation(rawTarget) {
    const cleaned = (rawTarget ?? "").toString().replace(/\s/g, "");
    if (!cleaned) return cleaned;
    if (cleaned.includes("@")) return cleaned;

    const candidates = phoneDigitsCandidates(cleaned);
    if (!candidates.size) return canonicalConversationPhone(cleaned);

    try {
      const owner = await ownerResolver.findOwnerByFlexiblePhone(cleaned);
      if (owner?.id) {
        const preferred = await ownerResolver.resolveBestKnownJidForOwner(
          owner.id,
          conversation.getOwnerConversation,
        );
        if (preferred) {
          console.log("Activation JID resolved from owner active_jid:", {
            rawTarget: cleaned,
            ownerId: owner.id,
            resolvedJid: preferred,
          });
          return preferred;
        }
      }
    } catch (err) {
      console.error("Activation owner active_jid lookup failed:", err?.message ?? err);
    }

    try {
      const chats = await channel.listChats();
      let bestJid = null;
      let bestTs = -1;
      for (const chat of chats ?? []) {
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
        if (!phoneLikelyMatches(chatDigits, candidates)) continue;

        let ts = 0;
        try {
          const recent = await chat.fetchMessages({ limit: 1 });
          ts = recent?.[0]?.timestamp ?? 0;
        } catch {
          ts = 0;
        }
        if (ts > bestTs) {
          bestTs = ts;
          bestJid = jid;
        }
      }
      if (bestJid) {
        console.log("Activation JID resolved from chats:", {
          rawTarget: cleaned,
          resolvedJid: bestJid,
        });
        return bestJid;
      }
    } catch (err) {
      console.error("Activation JID lookup failed:", err?.message ?? err);
    }

    const fallback = canonicalConversationPhone(cleaned);
    console.log("Activation JID fallback:", { rawTarget: cleaned, resolvedJid: fallback });
    return fallback;
  }

  async function activateAgentForTarget({ triggerSource, targetJid, notifyTemplate }) {
    const normalizedTargetJid = (targetJid ?? "").replace(/\s/g, "");
    const targetPhone = canonicalConversationPhone(normalizedTargetJid);
    console.log("Activating agent for:", { triggerSource, targetJid: normalizedTargetJid, targetPhone });

    const ownerResolution = await ownerResolver.resolveOwnerForTargetJid(normalizedTargetJid);
    const ownerId = ownerResolution?.ownerId ?? null;

    let conversationKey = targetPhone;
    let existingOwnerConv = null;
    if (ownerId) {
      existingOwnerConv = await conversation.getOwnerConversation(ownerId);
      if (existingOwnerConv?.phone_number) conversationKey = existingOwnerConv.phone_number;
    }

    let formattedHistory = [];
    try {
      formattedHistory = await channel.getChatHistory(normalizedTargetJid, 20);
    } catch (e) {
      console.error("History fetch failed:", e?.message ?? e);
    }

    const ownerProfile = await buildOwnerProfile(ownerId, targetPhone);
    const handoff = factsLib.buildHandoffPayload(formattedHistory);
    const baseFacts = factsLib.extractConversationFacts(
      existingOwnerConv?.facts ?? {},
      formattedHistory,
      handoff.pending_request,
      handoff,
      { lastSeenJid: normalizedTargetJid },
    );

    const aliasSet = new Set(
      Array.isArray(existingOwnerConv?.facts?.aliases)
        ? existingOwnerConv.facts.aliases
        : [],
    );
    aliasSet.add(normalizedTargetJid);

    const facts = {
      ...baseFacts,
      active_jid: normalizedTargetJid,
      active_jid_ts: Math.max(
        Number(existingOwnerConv?.facts?.active_jid_ts ?? 0),
        Math.floor(Date.now() / 1000),
      ),
      aliases: Array.from(
        new Set([normalizedTargetJid, targetPhone, conversationKey, ...Array.from(aliasSet)]),
      ).slice(-20),
      agent_assigned: true,
      agent_assignment_updated_at: new Date().toISOString(),
      last_seen_jid: normalizedTargetJid,
    };

    await supabase.from("agent_conversations").upsert(
      {
        phone_number: conversationKey,
        tenant_id: getTenantId(),
        owner_id: ownerId,
        mode: "agent",
        state: STATES.AGENT,
        history: formattedHistory,
        owner_profile: ownerProfile,
        facts,
      },
      { onConflict: "phone_number" },
    );

    await recordStateTransition(supabase, {
      tenantId: getTenantId(),
      chatId: conversationKey,
      fromState: null,
      toState: STATES.AGENT,
      reason: `activate:${triggerSource}`,
    });

    if (ownerId) {
      await supabase
        .from("agent_conversations")
        .update({ mode: "agent", state: STATES.AGENT })
        .eq("owner_id", ownerId);
      await conversation.setOwnerAgentAssignment(ownerId, true);
    }

    const greeting = await runAgent(
      conversationKey,
      "[SYSTEM: You have just been connected to this conversation. Review the chat history and greet the owner by name, acknowledging what they were asking about. Be warm and brief.]",
      { handoff, lastSeenJid: normalizedTargetJid, overrideHistory: formattedHistory },
    );
    await channel.sendMessage(normalizedTargetJid, greeting);
    if (notifyTemplate) await notifyStaff(notifyTemplate(conversationKey));
    return { targetPhone: conversationKey, targetJid: normalizedTargetJid };
  }

  // Staff replies to a bot notification. We fetch live history, mark the
  // escalation as resolved, ask the agent to continue with explicit staff
  // guidance, and send the reply on the live JID.
  async function handleStaffGuidanceReply({ routePhone, guidanceText }) {
    const conv = await conversation.getConversationByPhone(routePhone);
    if (!conv) {
      await notifyStaff(`⚠️ Could not route staff guidance. Conversation not found for ${routePhone}`);
      return;
    }

    const replyTarget = conv?.facts?.active_jid ?? routePhone;
    let liveHistory = conv?.history ?? [];
    try {
      liveHistory = await channel.getChatHistory(replyTarget, 30);
    } catch {
      // Fall back to DB history.
    }

    const lastUserMessage =
      [...liveHistory].reverse().find((m) => m.role === "user")?.content ??
      "Please continue the conversation with the owner based on staff direction.";

    const updatedFacts = {
      ...(conv?.facts ?? {}),
      awaiting_staff_direction: false,
      staff_instruction: guidanceText,
      staff_instruction_at: new Date().toISOString(),
      active_jid: replyTarget,
      active_jid_ts: Math.floor(Date.now() / 1000),
      aliases: Array.from(
        new Set([
          ...(Array.isArray(conv?.facts?.aliases) ? conv.facts.aliases : []),
          replyTarget,
          routePhone,
        ]),
      ).slice(-20),
      last_seen_jid: replyTarget,
    };

    await supabase
      .from("agent_conversations")
      .update({ mode: "agent", facts: updatedFacts })
      .eq("phone_number", routePhone);

    if (conv?.owner_id) {
      await supabase
        .from("agent_conversations")
        .update({ mode: "agent" })
        .eq("owner_id", conv.owner_id);
    }

    const reply = await runAgent(routePhone, lastUserMessage, {
      overrideHistory: liveHistory,
      lastSeenJid: replyTarget,
      staffInstruction: guidanceText,
    });
    await channel.sendMessage(replyTarget, reply);
    await notifyStaff(`✅ Staff guidance applied and owner updated for ${routePhone}`);
  }

  return {
    activateAgentForTarget,
    handleStaffGuidanceReply,
    resolveTargetJidForActivation,
  };
}
