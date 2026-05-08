// Pure derivations over conversation history. Decides what facts to surface
// in the prompt and how to fall back to history when no owner profile exists
// in the DB. No I/O.

import { extractName, isAffirmationOnlyMessage } from "./identity.js";

const PET_HINT_RE = /\b(dog|cat|pet|pets|puppy|kitten)\b/i;

function userMessages(history, latestUserMessage) {
  const lines = (history ?? [])
    .filter((m) => m?.role === "user" && typeof m?.content === "string")
    .map((m) => m.content);
  if (latestUserMessage) lines.push(latestUserMessage);
  return lines;
}

// Build a synthetic owner profile from chat history when we couldn't find an
// owner row. Surfaces a possible name and recent pet-related lines so the
// agent has SOMETHING to work with on a cold conversation.
export function historyFallbackOwnerProfile(phone, history) {
  const userLines = userMessages(history).slice(-12);
  const joined = userLines.join("\n");
  const possibleName = extractName(joined);
  const petHints = userLines.filter((line) => PET_HINT_RE.test(line)).slice(-4);

  const lines = [`Unknown owner (phone: ${phone})`];
  if (possibleName) lines.push(`Possible name from chat: ${possibleName}`);
  if (petHints.length) {
    lines.push("Recent pet-related messages:");
    for (const hint of petHints) lines.push(`- ${hint.slice(0, 120)}`);
  }
  return lines.join("\n");
}

// Snapshot of recent owner intent used as a "handoff" payload at activation
// (when staff flips the bot on for an existing chat).
export function buildHandoffPayload(history) {
  const lines = userMessages(history).map((m) => m.trim()).filter(Boolean);
  return {
    source: "whatsapp_recent_history",
    pending_request: lines.at(-1) ?? "",
    salient_user_points: lines.slice(-5),
    captured_at: new Date().toISOString(),
  };
}

// Distill the conversation into a few high-signal facts saved on
// agent_conversations.facts. Open intent prefers the most recent SUBSTANTIVE
// user message (i.e. ignoring affirmations like "yes"/"ok") so the bot does
// not mistake a confirmation for the actual ask.
export function extractConversationFacts(
  existingFacts,
  history,
  latestUserMessage,
  handoff,
  metadata = {},
) {
  const lines = userMessages(history, latestUserMessage);
  const possibleName =
    extractName(lines.join("\n")) ?? existingFacts?.possible_name ?? null;
  const petMentions = lines.filter((line) => PET_HINT_RE.test(line)).slice(-6);
  const substantiveIntent =
    [...lines].reverse().find((line) => !isAffirmationOnlyMessage(line)) ??
    handoff?.pending_request ??
    existingFacts?.open_intent ??
    null;

  return {
    ...(existingFacts ?? {}),
    possible_name: possibleName,
    pet_mentions: petMentions,
    open_intent: substantiveIntent,
    last_user_message: latestUserMessage ?? existingFacts?.last_user_message ?? null,
    last_seen_jid: metadata.lastSeenJid ?? existingFacts?.last_seen_jid ?? null,
    context_source: handoff ? "handoff" : (existingFacts?.context_source ?? "ongoing_chat"),
    last_updated_at: new Date().toISOString(),
  };
}
