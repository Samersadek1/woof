// Persists agent turn metrics and structured events. Kept side-effect-safe so
// observability never breaks the agent runtime.

function clipText(value, max = 4000) {
  if (value == null) return null;
  const str = typeof value === "string" ? value : String(value);
  return str.length > max ? str.slice(0, max) : str;
}

export async function recordAgentTurn(supabase, payload) {
  if (!payload?.chat_id) return;
  try {
    await supabase.from("agent_turns").insert({
      tenant_id: payload.tenant_id ?? null,
      chat_id: payload.chat_id,
      conversation_phone: payload.conversation_phone ?? null,
      latency_ms: payload.latency_ms ?? null,
      input_tokens: payload.input_tokens ?? null,
      output_tokens: payload.output_tokens ?? null,
      tool_trace: payload.tool_trace ?? null,
      outcome: payload.outcome ?? null,
      blocked_reason: payload.blocked_reason ?? null,
      message_in: clipText(payload.message_in),
      message_out: clipText(payload.message_out),
      escalated: Boolean(payload.escalated),
      metadata: payload.metadata ?? {},
    });
  } catch (err) {
    console.error("recordAgentTurn failed:", err?.message ?? err);
  }
}

export async function logAgentEvent(supabase, payload) {
  if (!payload?.event) return;
  try {
    await supabase.from("agent_events").insert({
      tenant_id: payload.tenant_id ?? null,
      chat_id: payload.chat_id ?? null,
      event: payload.event,
      payload: payload.payload ?? {},
    });
  } catch (err) {
    console.error("logAgentEvent failed:", err?.message ?? err);
  }
}
