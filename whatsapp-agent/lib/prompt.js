// Prompt template fill. Replaces {{token}} placeholders in the tenant's
// system_prompt_template. Also builds the unified MEMORY section that
// surfaces conversation state (handoff, summary, facts, staff direction)
// so the prompt template stays simple and consistent every turn.

export function fillTemplate(template, tokens) {
  if (typeof template !== "string") return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(tokens, key)) {
      const value = tokens[key];
      return value == null ? "" : String(value);
    }
    return "";
  });
}

const MEMORY_FACT_KEYS_INTERNAL = new Set([
  // High-signal facts to expose at the top of MEMORY.
  "open_intent",
  "pending_request",
  "possible_name",
  "pet_mentions",
  "last_user_message",
]);

function formatFactValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compactFacts(facts) {
  if (!facts || typeof facts !== "object") return [];
  const lines = [];
  for (const key of MEMORY_FACT_KEYS_INTERNAL) {
    if (facts[key] == null || facts[key] === "") continue;
    const text = formatFactValue(facts[key]);
    if (!text.trim()) continue;
    lines.push(`- ${key}: ${text.slice(0, 240)}`);
  }
  return lines;
}

function compactMemoryNotes(memory) {
  if (!memory || typeof memory !== "object") return [];
  const lines = [];
  for (const [key, value] of Object.entries(memory)) {
    if (key === "last_updated") continue;
    const text = formatFactValue(value);
    if (!text.trim()) continue;
    lines.push(`- ${key}: ${text.slice(0, 240)}`);
  }
  return lines;
}

// Build a single MEMORY section that consolidates everything the agent
// previously got from {{handoff_section}}, {{summary_section}},
// {{facts_section}}, {{staff_direction_section}}, {{escalation_hold_section}}.
// Returns both the new unified `memory_section` and the legacy keys (empty
// strings) so older prompt templates that still reference them keep rendering
// cleanly.
export function buildPromptSections({ handoff, summary, facts, staffInstruction }) {
  const blocks = [];

  if (staffInstruction) {
    blocks.push(
      `PRIORITY STAFF DIRECTION:\n${staffInstruction}\nFollow this direction exactly before responding to the owner.`
    );
  }

  if (facts?.awaiting_staff_direction) {
    blocks.push(
      "ESCALATION HOLD: A staff escalation is open. Keep the owner engaged " +
        "(acknowledge, ask clarifying questions) but do NOT execute booking, " +
        "confirmation, or cancellation actions until staff guidance arrives."
    );
  }

  if (handoff?.pending_request) {
    blocks.push(
      `HANDOFF CONTEXT (owner request before activation):\n${handoff.pending_request}\nAddress this first.`
    );
  }

  if (summary) {
    blocks.push(`CONVERSATION SUMMARY (older history compressed):\n${summary}`);
  }

  const factLines = compactFacts(facts);
  if (factLines.length) {
    blocks.push(`CONVERSATION FACTS:\n${factLines.join("\n")}`);
  }

  const memoryLines = compactMemoryNotes(facts?.memory);
  if (memoryLines.length) {
    blocks.push(`SAVED NOTES (from save_memory):\n${memoryLines.join("\n")}`);
  }

  const memory_section = blocks.length
    ? `MEMORY:\n${blocks.join("\n\n")}`
    : "";

  return {
    memory_section,
    handoff_section: "",
    summary_section: "",
    facts_section: "",
    staff_direction_section: "",
    escalation_hold_section: "",
  };
}
