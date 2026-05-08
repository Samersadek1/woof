// Conversation state machine. Centralizes the legal mode/state transitions and
// emits structured agent_events whenever a transition occurs.

import { logAgentEvent } from "./turns.js";

export const STATES = Object.freeze({
  NEW: "new",
  AGENT: "agent",
  AWAITING_STAFF: "awaiting_staff",
  HUMAN: "human",
  CLOSED: "closed",
});

const ALLOWED = {
  new: new Set(["agent", "human", "closed"]),
  agent: new Set(["agent", "awaiting_staff", "human", "closed"]),
  awaiting_staff: new Set(["agent", "human", "closed"]),
  human: new Set(["agent", "human", "closed"]),
  closed: new Set(["agent", "human", "closed"]),
};

export function canTransition(from, to) {
  const allowed = ALLOWED[from] ?? null;
  if (!allowed) return Boolean(to);
  return allowed.has(to);
}

export function deriveModeFromState(state) {
  if (state === STATES.HUMAN) return "human";
  return "agent";
}

export async function recordStateTransition(
  supabase,
  { tenantId, chatId, fromState, toState, reason },
) {
  await logAgentEvent(supabase, {
    tenant_id: tenantId,
    chat_id: chatId,
    event: "state_change",
    payload: {
      from: fromState ?? null,
      to: toState,
      reason: reason ?? null,
    },
  });
}
