// Plain-English receptionist escalation message builder.
//
// Hybrid summarizer:
//   - Deterministic sections (Owner header, "What they want", "What I've done",
//     route-marker footer) are templated from data we already have.
//   - One tiny LLM call (Claude haiku) writes the two narrative lines
//     ("Where I'm stuck" / "What I need from you") so the wording is natural
//     and context-aware. If the LLM call fails, we fall back to deterministic
//     phrases so escalation is never blocked by a model error.
//
// Usage:
//   const message = await buildStaffEscalationMessage({
//     phone, ownerProfile, lastUserMessage, toolTrace, reason,
//     anthropic, model
//   });

const PHONE_FORMATS = [
  // UAE (971) -> +971 NN NNN NNNN  e.g. 971 56 538 7473
  { prefix: "971", group: [2, 3, 4] },
  // Saudi (966) -> +966 NN NNN NNNN
  { prefix: "966", group: [2, 3, 4] },
  // Egypt (20) -> +20 NNN NNN NNNN
  { prefix: "20", group: [3, 3, 4] },
];

// Strip @c.us / @lid / @s.whatsapp.net suffixes and format the leading digits
// into a friendly +CC NN NNN NNNN string. Falls back to a raw + prefixed
// digit string if the country prefix is unknown.
export function formatPhone(jidOrPhone) {
  if (!jidOrPhone) return "unknown";
  const raw = String(jidOrPhone).split("@")[0];
  const digits = raw.replace(/\D/g, "");
  if (!digits) return String(jidOrPhone);

  // LID identifiers are random IDs, not phone numbers. Show them as-is.
  if (String(jidOrPhone).endsWith("@lid")) {
    return `(internal id ${digits.slice(-6)})`;
  }

  for (const fmt of PHONE_FORMATS) {
    if (!digits.startsWith(fmt.prefix)) continue;
    const tail = digits.slice(fmt.prefix.length);
    const groups = [];
    let cursor = 0;
    for (const size of fmt.group) {
      groups.push(tail.slice(cursor, cursor + size));
      cursor += size;
    }
    return `+${fmt.prefix} ${groups.filter(Boolean).join(" ")}`.trim();
  }

  return `+${digits}`;
}

// Pull the first-name + last-name (best effort) out of an ownerProfile string
// rendered by buildOwnerProfileFromOwnerId. The string starts with
//   "Name: First Last\nPhone: ..." or "Unknown owner..." or "Anonymous...".
export function extractOwnerName(ownerProfile) {
  if (typeof ownerProfile !== "string" || !ownerProfile) return null;
  const match = /Name:\s*([^\n]+)/i.exec(ownerProfile);
  if (!match) return null;
  const trimmed = match[1].trim();
  if (!trimmed || /^unknown/i.test(trimmed)) return null;
  return trimmed;
}

// Translate a single tool-trace entry into a plain-English bullet. Returns
// null when the entry should be skipped (e.g. the escalation tool itself or
// the round-limit marker that becomes the "stuck" line).
export function translateTraceEntry(entry) {
  if (typeof entry !== "string" || !entry.trim()) return null;
  const trimmed = entry.trim();

  if (trimmed === "tool_round_limit_reached") return null;
  if (/^escalate_to_human:/.test(trimmed)) return null;

  // Any tool that the model invoked but is not registered for the tenant.
  // Pattern: "<name>: error=Tool not enabled for tenant: <name>"
  let m = /^([\w_]+):\s*error=Tool not enabled for tenant:\s*(\S+)/i.exec(trimmed);
  if (m) {
    const name = m[2] || m[1];
    return `Tried to call ${name} as a top-level tool, but it has to be invoked via call_rpc.`;
  }

  // call_rpc errors
  m = /^call_rpc:\s*error=RPC not allowed or unknown:\s*(\S+)/i.exec(trimmed);
  if (m) return `Tried to call ${m[1]}, but the system doesn't have that capability yet.`;

  m = /^call_rpc:\s*error=invalid input value for enum (\w+):\s*"([^"]+)"/i.exec(trimmed);
  if (m) return `Tried to use ${m[1]} = "${m[2]}", but that isn't a valid value.`;

  m = /^call_rpc:\s*error=(.+)$/i.exec(trimmed);
  if (m) return `RPC failed: ${m[1].slice(0, 140)}.`;

  m = /^call_rpc:\s*(.+)$/i.exec(trimmed);
  if (m) {
    const detail = m[1].slice(0, 140);
    return /created|recorded|booked|updated|saved|linked/i.test(detail)
      ? detail
      : `RPC succeeded: ${detail}`;
  }

  // query_database results
  m = /^query_database:\s*error=column ([\w.]+) does not exist/i.exec(trimmed);
  if (m) return `Tried to read column ${m[1]}, but it doesn't exist.`;

  m = /^query_database:\s*error=invalid input value for enum (\w+):\s*"([^"]+)"/i.exec(trimmed);
  if (m) return `Filtered ${m[1]} on "${m[2]}", which isn't a valid value.`;

  m = /^query_database:\s*error=Table not allowed or unknown:\s*(\S+)/i.exec(trimmed);
  if (m) return `Tried to read table ${m[1]}, but it isn't accessible.`;

  m = /^query_database:\s*error=(.+)$/i.exec(trimmed);
  if (m) return `Database lookup failed: ${m[1].slice(0, 140)}.`;

  m = /^query_database:\s*rows=(\d+)/i.exec(trimmed);
  if (m) return `Looked up ${m[1]} record${m[1] === "1" ? "" : "s"}.`;

  // booking creation
  m = /^create_draft_booking:\s*draft=(\S+)/i.exec(trimmed);
  if (m) return `Drafted boarding booking ${m[1]}.`;

  m = /^create_park_booking:\s*draft=(\S+)/i.exec(trimmed);
  if (m) return `Drafted park booking ${m[1]}.`;

  m = /^create_(?:draft|park)_booking:\s*error=(.+)$/i.exec(trimmed);
  if (m) return `Booking draft failed: ${m[1].slice(0, 140)}.`;

  // profile updates
  m = /^update_owner_profile:\s*updated=(.+)$/i.exec(trimmed);
  if (m) return `Updated profile fields: ${m[1]}.`;

  m = /^update_owner_profile:\s*error=(.+)$/i.exec(trimmed);
  if (m) return `Profile update failed: ${m[1].slice(0, 140)}.`;

  // memory
  m = /^save_memory:\s*saved=(.+)$/i.exec(trimmed);
  if (m) return `Remembered ${m[1]} for later.`;

  // generic shape: tool: detail
  m = /^([\w_]+):\s*(.+)$/i.exec(trimmed);
  if (m) return `${m[1]}: ${m[2].slice(0, 140)}`;

  return trimmed.slice(0, 160);
}

// Identify the missing capabilities the model attempted, so the LLM
// summarizer can lean on them when writing the "stuck" / "ask" lines.
function findCapabilityMisses(toolTrace) {
  const misses = [];
  for (const entry of toolTrace ?? []) {
    if (typeof entry !== "string") continue;
    const m = /error=RPC not allowed or unknown:\s*(\S+)/i.exec(entry);
    if (m) misses.push(m[1]);
  }
  return Array.from(new Set(misses));
}

const FALLBACK_STUCK = "I tried several approaches but couldn't complete the request on my own.";
const FALLBACK_ASK   = "Please reply with guidance, or take over and message the owner directly.";

// Single tiny LLM call. Returns { stuck, ask }. Always resolves -- catches
// any error and falls back to deterministic copy.
async function generateNarrative({
  anthropic,
  model,
  reason,
  lastUserMessage,
  doneBullets,
  capabilityMisses,
}) {
  if (!anthropic) {
    return { stuck: FALLBACK_STUCK, ask: FALLBACK_ASK };
  }
  const systemPrompt =
    "You write 2-line handoff notes for a WhatsApp pet-boarding receptionist. " +
    "Output ONLY a strict JSON object with two keys: \"stuck\" and \"ask\". " +
    "Both values are plain English, ONE sentence each, max 160 chars, " +
    "no emojis, no markdown, no quotes, no jargon, no tool/RPC names. " +
    "\"stuck\" describes WHY the bot couldn't finish in human terms. " +
    "\"ask\" tells the receptionist what to do next (give specific guidance, " +
    "take over, or confirm a particular detail).";

  const userPayload = {
    block_reason: reason,
    last_owner_message: lastUserMessage,
    what_i_did: doneBullets,
    missing_capabilities: capabilityMisses,
  };

  try {
    const response = await anthropic.messages.create({
      model: model || "claude-3-5-haiku-latest",
      max_tokens: 220,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    });
    const text = (response?.content ?? [])
      .filter((b) => b?.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("empty narrative");
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("no json in response");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      stuck: String(parsed.stuck ?? FALLBACK_STUCK).slice(0, 200) || FALLBACK_STUCK,
      ask: String(parsed.ask ?? FALLBACK_ASK).slice(0, 200) || FALLBACK_ASK,
    };
  } catch (err) {
    console.warn("Escalation narrative fallback:", err?.message ?? err);
    return { stuck: FALLBACK_STUCK, ask: FALLBACK_ASK };
  }
}

// Build the staff message and return both the human-readable text and the
// derived structured fields (for persistence on agent_turns.staff_notification
// and for the tool result returned to the model).
export async function buildStaffEscalationMessage({
  phone,
  ownerProfile,
  lastUserMessage,
  toolTrace = [],
  reason = "agent_blocked",
  modelReason,
  modelSummary,
  anthropic,
  narrativeModel,
}) {
  const ownerName = extractOwnerName(ownerProfile) || "Unknown owner";
  const phoneLabel = formatPhone(phone);

  const wantText = (() => {
    const raw = String(modelSummary ?? lastUserMessage ?? "").trim();
    if (!raw) return "Owner sent no message text.";
    return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
  })();

  const doneBullets = (toolTrace ?? [])
    .map(translateTraceEntry)
    .filter((line) => Boolean(line));
  const doneSection = doneBullets.length
    ? doneBullets.map((b) => `  - ${b}`).join("\n")
    : "  - (nothing yet)";

  const capabilityMisses = findCapabilityMisses(toolTrace);

  const { stuck, ask } = await generateNarrative({
    anthropic,
    model: narrativeModel,
    reason: modelReason || reason,
    lastUserMessage,
    doneBullets,
    capabilityMisses,
  });

  const lines = [
    "Help needed for WhatsApp chat",
    "",
    `Owner: ${ownerName} (${phoneLabel})`,
    `What they want: ${wantText}`,
    "What I've done:",
    doneSection,
    `Where I'm stuck: ${stuck}`,
    `What I need from you: ${ask}`,
    "",
    "Reply to this message with guidance.",
    `[#route phone=${phone} state=awaiting_staff]`,
  ];

  return {
    text: lines.join("\n"),
    structured: {
      owner: ownerName,
      phone: phoneLabel,
      want: wantText,
      done: doneBullets,
      stuck,
      ask,
      capability_misses: capabilityMisses,
      reason: modelReason || reason,
    },
  };
}
