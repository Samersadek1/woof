// Owner-resolution layer. All paths from a WhatsApp identifier (phone, JID,
// or LID-bridged phone) to an owners.id row live here. The agent core never
// queries owners directly -- it goes through this resolver.
//
// Factory pattern so we can inject dependencies in tests / replays without
// reaching into module-level globals.

import {
  canonicalConversationPhone,
  normalizeDigits,
  phoneDigitsCandidates,
  phoneLikelyMatches,
} from "./identity.js";

export function createOwnerResolver({ supabase, client }) {
  // Find an owner by *any* phone variant we can derive (E.164, local, etc).
  // Two-step: cheap ilike on digit tails, then strict in-memory match.
  async function findOwnerByFlexiblePhone(phone) {
    const candidates = phoneDigitsCandidates(phone);
    if (!candidates.size) return null;

    const tails = [...candidates]
      .map((c) => c.slice(-9))
      .filter((t) => t.length >= 7);
    const uniqueTails = [...new Set(tails)].slice(0, 6);

    let query = supabase
      .from("owners")
      .select("id, first_name, last_name, member_type, wallet_balance, phone")
      .limit(100);

    if (uniqueTails.length) {
      query = query.or(uniqueTails.map((t) => `phone.ilike.%${t}%`).join(","));
    }

    const { data, error } = await query;
    if (error || !data?.length) return null;

    return (
      data.find((o) => phoneLikelyMatches(normalizeDigits(o.phone), candidates)) ?? null
    );
  }

  // Find owner by an exact JID we have already seen and persisted somewhere
  // (phone_number, facts.active_jid, or facts.aliases).
  async function findOwnerByKnownJid(jid) {
    if (!jid || (!jid.endsWith("@c.us") && !jid.endsWith("@lid"))) return null;

    const lookups = [
      { label: "known_jid_phone_number", filter: (q) => q.eq("phone_number", jid) },
      { label: "known_jid_active_jid", filter: (q) => q.eq("facts->>active_jid", jid) },
    ];

    for (const lookup of lookups) {
      try {
        const { data } = await lookup.filter(
          supabase
            .from("agent_conversations")
            .select("owner_id, phone_number")
            .not("owner_id", "is", null)
            .order("updated_at", { ascending: false })
            .limit(1),
        ).maybeSingle();
        if (data?.owner_id) {
          return {
            id: data.owner_id,
            conversationPhone: data.phone_number,
            source: lookup.label,
          };
        }
      } catch {
        // Fall through to next lookup.
      }
    }

    try {
      const { data } = await supabase
        .from("agent_conversations")
        .select("owner_id, phone_number, updated_at")
        .contains("facts", { aliases: [jid] })
        .not("owner_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(20);
      const best = (data ?? []).find((c) => c?.owner_id);
      if (best?.owner_id) {
        return {
          id: best.owner_id,
          conversationPhone: best.phone_number,
          source: "known_jid_aliases",
        };
      }
    } catch {
      // Ignore alias lookup errors and fall through.
    }

    return null;
  }

  // Map any inbound JID to an owner. Tries known JIDs first, then LID->phone
  // bridge, then a flexible phone match.
  async function resolveOwnerForTargetJid(targetJid) {
    const known = await findOwnerByKnownJid(targetJid);
    if (known?.id) return { ownerId: known.id, source: `known_jid:${known.source}` };

    if (targetJid.endsWith("@lid") && typeof client?.getContactLidAndPhone === "function") {
      try {
        const bridge = await client.getContactLidAndPhone([targetJid]);
        const bridgedPnRaw = Array.isArray(bridge) ? bridge[0]?.pn : bridge?.pn;
        const bridgedPhone = bridgedPnRaw ? canonicalConversationPhone(bridgedPnRaw) : null;
        if (bridgedPhone) {
          const bridgedOwner = await findOwnerByFlexiblePhone(bridgedPhone);
          if (bridgedOwner?.id) {
            return {
              ownerId: bridgedOwner.id,
              source: "lid_bridge_phone_match",
              bridgedPhone,
            };
          }
        }
      } catch {
        // Bridge can fail on stale chats; fall through.
      }
    }

    const fallbackOwner = await findOwnerByFlexiblePhone(targetJid);
    if (fallbackOwner?.id) {
      return { ownerId: fallbackOwner.id, source: "flexible_phone_match" };
    }
    return { ownerId: null, source: "no_owner_match" };
  }

  // Pick the best JID we can reach this owner on right now. Prefers known
  // aliases that still resolve in WhatsApp Web, then scans all chats by
  // owner phone digits and picks the most recently active match.
  async function resolveBestKnownJidForOwner(ownerId, getOwnerConversation) {
    const ownerConv = getOwnerConversation
      ? await getOwnerConversation(ownerId)
      : null;
    const facts = ownerConv?.facts ?? {};
    const aliasCandidates = new Set();

    if (typeof facts.active_jid === "string") aliasCandidates.add(facts.active_jid);
    if (Array.isArray(facts.aliases)) {
      for (const alias of facts.aliases) {
        if (typeof alias === "string") aliasCandidates.add(alias);
      }
    }
    if (
      ownerConv?.phone_number?.endsWith("@c.us") ||
      ownerConv?.phone_number?.endsWith("@lid")
    ) {
      aliasCandidates.add(ownerConv.phone_number);
    }

    let bestJid = null;
    let bestTs = -1;

    for (const jid of aliasCandidates) {
      if (!jid.endsWith("@c.us") && !jid.endsWith("@lid")) continue;
      try {
        const chat = await client.getChatById(jid);
        const recent = await chat.fetchMessages({ limit: 1 });
        const ts = Number(recent?.[0]?.timestamp ?? 0);
        if (ts > bestTs) {
          bestTs = ts;
          bestJid = jid;
        }
      } catch {
        // Stale alias not in current WA session; skip.
      }
    }

    try {
      const { data: ownerRow } = await supabase
        .from("owners")
        .select("phone")
        .eq("id", ownerId)
        .maybeSingle();
      const ownerCandidates = phoneDigitsCandidates(ownerRow?.phone ?? "");
      if (ownerCandidates.size) {
        const chats = await client.getChats();
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
          if (!phoneLikelyMatches(chatDigits, ownerCandidates)) continue;

          let ts = 0;
          try {
            const recent = await chat.fetchMessages({ limit: 1 });
            ts = Number(recent?.[0]?.timestamp ?? 0);
          } catch {
            ts = 0;
          }
          if (ts > bestTs) {
            bestTs = ts;
            bestJid = jid;
          }
        }
      }
    } catch {
      // Ignore owner-scan failures and keep best known alias.
    }

    return bestJid;
  }

  return {
    findOwnerByFlexiblePhone,
    findOwnerByKnownJid,
    resolveOwnerForTargetJid,
    resolveBestKnownJidForOwner,
  };
}
