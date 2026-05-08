// Rolling history compaction. When a chat history grows beyond
// SUMMARY_TRIGGER turns we summarize older turns into a short paragraph
// (stored on facts.summary AND injected as a single assistant message at
// the start of history) and keep only the most recent KEEP_TURNS.
//
// Anthropic context-rot mitigation: the model sees a structured summary
// instead of every old WhatsApp message, which keeps cost bounded and
// improves accuracy on long conversations.

const KEEP_TURNS = Number(process.env.AGENT_HISTORY_KEEP_TURNS ?? 10);
const SUMMARY_TRIGGER = Number(process.env.AGENT_HISTORY_SUMMARY_TRIGGER ?? 15);
const SUMMARY_MAX_CHARS = Number(process.env.AGENT_HISTORY_SUMMARY_MAX_CHARS ?? 1200);

export const HISTORY_SUMMARY_MARKER = "[SUMMARY OF EARLIER CONVERSATION]";

function pickTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

function isSummaryMessage(turn) {
  if (!turn || turn.role !== "assistant") return false;
  const text = pickTextContent(turn.content);
  return typeof text === "string" && text.startsWith(HISTORY_SUMMARY_MARKER);
}

function buildHeuristicSummary(turns) {
  const lines = [];
  for (const turn of turns) {
    const text = pickTextContent(turn?.content).trim();
    if (!text) continue;
    const role = turn.role === "assistant" ? "agent" : "owner";
    lines.push(`${role}: ${text.slice(0, 220)}`);
  }
  const joined = lines.slice(-12).join("\n");
  return joined.slice(0, SUMMARY_MAX_CHARS);
}

async function summarizeWithAnthropic(anthropic, model, turns, existingSummary) {
  const payload = turns
    .map((turn) => {
      const role = turn.role === "assistant" ? "agent" : "owner";
      const text = pickTextContent(turn?.content).trim();
      return text ? `${role}: ${text.slice(0, 400)}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt =
    "Summarize the WhatsApp conversation below in 3-4 short sentences. " +
    "Capture: client name and pets if mentioned, the open intent (booking, daycare, park, grooming, etc.), " +
    "key dates, agreed actions, blockers, and any staff direction. Be factual. No fluff.";

  const messages = [
    {
      role: "user",
      content:
        (existingSummary ? `Previous summary:\n${existingSummary}\n\n` : "") +
        `New transcript:\n${payload}`,
    },
  ];

  const response = await anthropic.messages.create({
    model,
    max_tokens: 350,
    system: prompt,
    messages,
  });

  const text = (response?.content ?? [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text.slice(0, SUMMARY_MAX_CHARS);
}

// Compact `history` if it has grown beyond SUMMARY_TRIGGER. Returns:
//   { rolled, history, summary }
// where `history` is the compacted array (with the summary as the first
// assistant message when rolled) and `summary` is the plain summary text
// (also persisted on facts.summary by the caller).
export async function maybeRollupHistory({
  history,
  existingSummary,
  anthropic,
  model,
}) {
  const safeHistory = Array.isArray(history) ? history : [];
  if (safeHistory.length <= SUMMARY_TRIGGER) {
    return { rolled: false, history: safeHistory, summary: existingSummary ?? null };
  }

  // Strip any prior in-history summary marker so we do not re-summarize a
  // summary -- we will replace it with the new one if applicable.
  const realHistory = safeHistory.filter((m) => !isSummaryMessage(m));
  if (realHistory.length <= SUMMARY_TRIGGER) {
    return { rolled: false, history: safeHistory, summary: existingSummary ?? null };
  }

  const oldTurns = realHistory.slice(0, realHistory.length - KEEP_TURNS);
  const recentTurns = realHistory.slice(-KEEP_TURNS);

  let summary = existingSummary ?? null;
  try {
    if (anthropic && model) {
      summary = await summarizeWithAnthropic(anthropic, model, oldTurns, existingSummary);
    } else {
      summary = buildHeuristicSummary(oldTurns);
    }
  } catch (err) {
    console.error("History summarize fallback engaged:", err?.message ?? err);
    summary = buildHeuristicSummary(oldTurns);
  }

  const summaryEntry = {
    role: "assistant",
    content: `${HISTORY_SUMMARY_MARKER}\n${summary ?? ""}`,
  };

  return { rolled: true, history: [summaryEntry, ...recentTurns], summary };
}

export const HISTORY_KEEP_TURNS = KEEP_TURNS;
export const HISTORY_SUMMARY_TRIGGER = SUMMARY_TRIGGER;
