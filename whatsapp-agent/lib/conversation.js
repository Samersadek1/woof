// agent_conversations CRUD + inbound routing. Owns every read/write to the
// per-chat row, plus the logic that maps an inbound WhatsApp message to the
// right owner conversation (handling LID/c.us alias drift in one place).

import { canonicalConversationPhone, normalizeDigits } from "./identity.js";

export function createConversationStore({ supabase, client, ownerResolver }) {
  async function getConversationByPhone(phone) {
    if (!phone) return null;
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("phone_number", phone)
      .maybeSingle();
    if (error) {
      console.error("getConversationByPhone failed:", { phone, error: error.message });
      return null;
    }
    return data ?? null;
  }

  async function getOwnerConversation(ownerId) {
    if (!ownerId) return null;
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("getOwnerConversation failed:", { ownerId, error: error.message });
      return null;
    }
    return data ?? null;
  }

  async function setOwnerAgentAssignment(ownerId, assigned) {
    if (!ownerId) return;
    const { data: convs } = await supabase
      .from("agent_conversations")
      .select("phone_number, facts")
      .eq("owner_id", ownerId);

    for (const conv of convs ?? []) {
      const facts = {
        ...(conv?.facts ?? {}),
        agent_assigned: assigned,
        agent_assignment_updated_at: new Date().toISOString(),
      };
      await supabase
        .from("agent_conversations")
        .update({ facts })
        .eq("phone_number", conv.phone_number);
    }
  }

  async function setAwaitingStaffDirection(phone, reason, summary) {
    const conv = await getConversationByPhone(phone);
    const facts = {
      ...(conv?.facts ?? {}),
      awaiting_staff_direction: true,
      escalation_reason: reason,
      escalation_summary: summary,
      escalation_requested_at: new Date().toISOString(),
    };
    await supabase
      .from("agent_conversations")
      .update({ mode: "agent", facts })
      .eq("phone_number", phone);
  }

  // Track which JID an owner is currently active on, plus a bounded list of
  // historical aliases. The most recent inbound timestamp wins -- we never
  // regress to an older JID.
  async function recordActiveJidForOwner({
    ownerId,
    ownerConv,
    inboundJid,
    inboundTs,
    aliases = [],
  }) {
    if (!ownerId || !inboundJid) return ownerConv ?? null;

    const existingFacts = ownerConv?.facts ?? {};
    const tsNow = Number(inboundTs ?? Math.floor(Date.now() / 1000));
    const previousTs = Number(existingFacts.active_jid_ts ?? 0);

    const aliasSet = new Set(
      Array.isArray(existingFacts.aliases) ? existingFacts.aliases : [],
    );
    aliasSet.add(inboundJid);
    for (const alias of aliases) {
      if (typeof alias === "string" && alias.trim()) aliasSet.add(alias.trim());
    }

    const nextActiveJid =
      tsNow >= previousTs ? inboundJid : (existingFacts.active_jid ?? inboundJid);
    const nextActiveTs = Math.max(previousTs, tsNow);

    const updatedFacts = {
      ...existingFacts,
      active_jid: nextActiveJid,
      active_jid_ts: nextActiveTs,
      aliases: Array.from(aliasSet).slice(-20),
      last_seen_jid: inboundJid,
    };

    const conversationKey = ownerConv?.phone_number ?? inboundJid;
    const { error } = await supabase.from("agent_conversations").upsert(
      {
        phone_number: conversationKey,
        owner_id: ownerId,
        facts: updatedFacts,
      },
      { onConflict: "phone_number" },
    );
    if (error) {
      console.error("recordActiveJidForOwner failed:", {
        ownerId,
        conversationKey,
        error: error.message,
      });
      return ownerConv;
    }

    return {
      ...(ownerConv ?? {
        phone_number: conversationKey,
        owner_id: ownerId,
        mode: "human",
        history: [],
      }),
      phone_number: conversationKey,
      owner_id: ownerId,
      facts: updatedFacts,
    };
  }

  // Map an inbound WhatsApp message to a stable conversation key + reply
  // target + an early owner hint. Tries known JID first, then direct match,
  // then a contact lookup, then a flexible phone fallback.
  async function resolveInboundRouting(msg) {
    const replyTarget = msg.from;
    const knownOwner = await ownerResolver.findOwnerByKnownJid(replyTarget);
    if (knownOwner?.id) {
      const conversationPhone =
        knownOwner.conversationPhone ?? canonicalConversationPhone(replyTarget);
      return {
        replyTarget,
        conversationPhone,
        lookupCandidates: [conversationPhone, replyTarget],
        ownerIdHint: knownOwner.id,
        source: knownOwner.source,
      };
    }

    if (replyTarget.endsWith("@c.us")) {
      const conversationPhone = canonicalConversationPhone(replyTarget);
      const owner = await ownerResolver.findOwnerByFlexiblePhone(conversationPhone);
      return {
        replyTarget,
        conversationPhone,
        lookupCandidates: [conversationPhone, replyTarget],
        ownerIdHint: owner?.id ?? null,
        source: "direct",
      };
    }

    let contactDigits = "";
    let contactMappedPhone = null;
    try {
      const contact = await msg.getContact();
      contactDigits = normalizeDigits(contact?.number ?? "");
      contactMappedPhone = contactDigits ? canonicalConversationPhone(contactDigits) : null;
    } catch {
      // Contact lookup failed; rely on raw JID below.
    }

    if (contactMappedPhone) {
      const owner = await ownerResolver.findOwnerByFlexiblePhone(contactMappedPhone);
      if (owner?.id) {
        return {
          replyTarget,
          conversationPhone: contactMappedPhone,
          lookupCandidates: [contactMappedPhone, replyTarget],
          ownerIdHint: owner.id,
          contactMappedPhone,
          source: "contact_match",
        };
      }
    }

    const rawConversationPhone = canonicalConversationPhone(replyTarget);
    const owner = await ownerResolver.findOwnerByFlexiblePhone(rawConversationPhone);
    return {
      replyTarget,
      conversationPhone: rawConversationPhone,
      lookupCandidates: [rawConversationPhone, replyTarget, contactMappedPhone].filter(Boolean),
      ownerIdHint: owner?.id ?? null,
      contactMappedPhone,
      source: "fallback",
    };
  }

  // Append `inboundJid` to a conversation row's facts.aliases and update
  // last_seen_jid. Bounded list keeps the row small.
  async function persistAlias(conv, inboundJid, conversationKey = conv?.phone_number) {
    const aliasSet = new Set(
      Array.isArray(conv?.facts?.aliases) ? conv.facts.aliases : [],
    );
    if (aliasSet.has(inboundJid) || !conversationKey) return;
    aliasSet.add(inboundJid);
    await supabase
      .from("agent_conversations")
      .update({
        facts: {
          ...(conv?.facts ?? {}),
          aliases: Array.from(aliasSet).slice(-20),
          last_seen_jid: inboundJid,
        },
      })
      .eq("phone_number", conversationKey);
  }

  // Given the result of resolveInboundRouting, pick the canonical owner row
  // to act on. Critical for keeping LID/c.us conversations on a single
  // thread.
  async function resolveOwnerConversationForInbound(routing) {
    const inboundJid = routing?.replyTarget ?? "";

    if (inboundJid.endsWith("@c.us") || inboundJid.endsWith("@lid")) {
      const ownerLookups = [
        ["inbound_phone_number_match", (q) => q.eq("phone_number", inboundJid)],
        ["inbound_active_jid_match", (q) => q.eq("facts->>active_jid", inboundJid)],
      ];

      for (const [label, build] of ownerLookups) {
        try {
          const { data } = await build(
            supabase
              .from("agent_conversations")
              .select("owner_id, phone_number, mode, facts")
              .not("owner_id", "is", null)
              .order("updated_at", { ascending: false })
              .limit(1),
          ).maybeSingle();
          if (data?.owner_id) {
            return { ownerId: data.owner_id, ownerConv: data, source: label };
          }
        } catch {
          // Try next strategy.
        }
      }

      try {
        const { data: aliasConvs } = await supabase
          .from("agent_conversations")
          .select("owner_id, phone_number, mode, facts, updated_at")
          .contains("facts", { aliases: [inboundJid] })
          .order("updated_at", { ascending: false })
          .limit(20);
        const ownerHit = (aliasConvs ?? []).find((c) => c?.owner_id);
        if (ownerHit?.owner_id) {
          return {
            ownerId: ownerHit.owner_id,
            ownerConv: ownerHit,
            source: "inbound_alias_match",
          };
        }
        const anonHit = (aliasConvs ?? []).find((c) => c?.phone_number);
        if (anonHit?.phone_number) {
          return {
            ownerId: null,
            ownerConv: anonHit,
            source: "inbound_alias_match_anon",
          };
        }
      } catch {
        // Continue to LID-bridge / phone fallback.
      }
    }

    if (inboundJid.endsWith("@lid") && typeof client?.getContactLidAndPhone === "function") {
      try {
        const bridge = await client.getContactLidAndPhone([inboundJid]);
        const bridgedPnRaw = Array.isArray(bridge) ? bridge[0]?.pn : bridge?.pn;
        const bridgedPhone = bridgedPnRaw ? canonicalConversationPhone(bridgedPnRaw) : null;
        if (bridgedPhone) {
          const bridgedOwner = await ownerResolver.findOwnerByFlexiblePhone(bridgedPhone);
          if (bridgedOwner?.id) {
            const ownerConv = await getOwnerConversation(bridgedOwner.id);
            return {
              ownerId: bridgedOwner.id,
              ownerConv: ownerConv ?? null,
              source: ownerConv ? "inbound_lid_bridge_owner_row" : "inbound_lid_bridge_no_row",
            };
          }

          // No owner record, but staff may have activated `!bot <number>` for
          // a chat that has no owners row. Look up the conversation by the
          // bridged @c.us key, persist the inbound @lid as an alias, and
          // resolve mode/state from that row.
          const { data: bridgedConv } = await supabase
            .from("agent_conversations")
            .select("owner_id, phone_number, mode, facts")
            .eq("phone_number", bridgedPhone)
            .maybeSingle();
          if (bridgedConv?.phone_number) {
            await persistAlias(bridgedConv, inboundJid, bridgedPhone);
            return {
              ownerId: bridgedConv.owner_id ?? null,
              ownerConv: bridgedConv,
              source: "inbound_lid_bridge_anon_conv",
            };
          }
        }
      } catch (err) {
        console.error("LID bridge failed:", { inboundJid, error: err?.message ?? err });
      }
    }

    const ownerFromReply = await ownerResolver.findOwnerByFlexiblePhone(routing.replyTarget);
    const ownerFromContact = routing.contactMappedPhone
      ? await ownerResolver.findOwnerByFlexiblePhone(routing.contactMappedPhone)
      : null;
    const owner =
      ownerFromReply ??
      ownerFromContact ??
      (await ownerResolver.findOwnerByFlexiblePhone(routing.conversationPhone));
    if (!owner?.id) return null;

    let ownerConv = await getOwnerConversation(owner.id);
    if (!ownerConv && routing.contactMappedPhone) {
      try {
        const { data: mappedConv } = await supabase
          .from("agent_conversations")
          .select("owner_id, phone_number, mode, facts")
          .eq("phone_number", routing.contactMappedPhone)
          .not("owner_id", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mappedConv?.owner_id) ownerConv = mappedConv;
      } catch {
        // Ignore; we already have the owner.
      }
    }

    return {
      ownerId: owner.id,
      ownerConv: ownerConv ?? null,
      source: ownerFromContact
        ? ownerConv
          ? "inbound_contact_mapped_phone_owner_row"
          : "inbound_contact_mapped_phone_no_row"
        : ownerConv
          ? "inbound_phone_fallback_owner_row"
          : "inbound_phone_fallback_no_row",
    };
  }

  return {
    getConversationByPhone,
    getOwnerConversation,
    setOwnerAgentAssignment,
    setAwaitingStaffDirection,
    recordActiveJidForOwner,
    resolveInboundRouting,
    resolveOwnerConversationForInbound,
  };
}
