// Offline replay harness. Runs a stored conversation history against the
// current tenant prompt and tools to catch prompt/regression issues before
// deploy. Does NOT touch live agent_conversations or send any WhatsApp
// messages.
//
// Usage:
//   node scripts/replay-conversation.mjs --phone <conversation_phone> [--limit 30]
//   node scripts/replay-conversation.mjs --owner <owner_id>
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, TENANT_SLUG.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

import { loadTenant } from "../lib/tenant.js";
import { fillTemplate, buildPromptSections } from "../lib/prompt.js";
import { buildToolDefinitions } from "../lib/tools.js";
import { maybeRollupHistory } from "../lib/summary.js";

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-4-6";
const MAX_TOK = 512;

function parseArgs(argv) {
  const args = { phone: null, owner: null, limit: 30 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--phone" && argv[i + 1]) {
      args.phone = argv[++i];
    } else if (a === "--owner" && argv[i + 1]) {
      args.owner = argv[++i];
    } else if (a === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.phone && !args.owner) {
    console.error("Usage: replay-conversation.mjs --phone <phone> | --owner <owner_id>");
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const TENANT_SLUG = process.env.TENANT_SLUG || "woof";

  if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_API_KEY) {
    console.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY required.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const ctx = await loadTenant(supabase, TENANT_SLUG);

  let conv;
  if (args.phone) {
    const { data } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("phone_number", args.phone)
      .maybeSingle();
    conv = data;
  } else {
    const { data } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("owner_id", args.owner)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conv = data;
  }

  if (!conv) {
    console.error("Conversation not found.");
    process.exit(1);
  }

  const history = (conv.history ?? []).slice(-Math.max(args.limit, 4));
  if (!history.length) {
    console.error("No history available to replay.");
    process.exit(1);
  }

  const lastUser = [...history].reverse().find((m) => m?.role === "user");
  if (!lastUser) {
    console.error("No user message found in history.");
    process.exit(1);
  }

  const rollup = await maybeRollupHistory({
    history: history.slice(0, -1),
    existingSummary: conv?.facts?.summary ?? null,
    anthropic,
    model: MODEL,
  });

  const sections = buildPromptSections({
    handoff: null,
    summary: rollup.summary,
    facts: conv?.facts ?? {},
    staffInstruction: conv?.facts?.staff_instruction ?? null,
  });

  const systemPrompt = fillTemplate(ctx.prompt.system_prompt_template, {
    display_name: ctx.tenant.display_name,
    language: ctx.tenant.language,
    timezone: ctx.tenant.timezone,
    today: new Date().toISOString().split("T")[0],
    rules: ctx.businessRules,
    owner_profile: conv?.owner_profile ?? `Replay (phone: ${conv.phone_number})`,
    ...sections,
  });

  const tools = buildToolDefinitions(ctx.tools);
  const messages = [...rollup.history, lastUser];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOK,
    system: systemPrompt,
    tools,
    messages,
  });

  const text = (response?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolCalls = (response?.content ?? [])
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ name: b.name, input: b.input }));

  console.log(JSON.stringify({
    tenant: ctx.tenant.slug,
    conversation_phone: conv.phone_number,
    last_user_message: lastUser.content,
    stop_reason: response.stop_reason,
    response_text: text,
    tool_calls: toolCalls,
    usage: response.usage,
  }, null, 2));
}

main().catch((err) => {
  console.error("Replay failed:", err?.message ?? err);
  process.exit(1);
});
