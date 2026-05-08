// Agent runner: a single Anthropic conversation turn end-to-end.
// Pure with respect to side effects -- they all flow through the injected
// services (supabase, anthropic, channel, executeTool, ownerContext).
//
// Returns the final reply text. Persistence (history, turn metrics, events)
// happens here so the caller is just `const reply = await runAgent(...)`.

import { fillTemplate, buildPromptSections } from "./prompt.js";
import { maybeRollupHistory, HISTORY_KEEP_TURNS } from "./summary.js";
import { recordAgentTurn, logAgentEvent } from "./turns.js";
import { invalidateBudgetCache } from "./cost.js";
import { summarizeToolResult } from "./tools.js";

export function buildSystemPrompt({ tenant, prompt, businessRules, ownerProfile, options = {} }) {
  const today = new Date().toISOString().split("T")[0];
  const sections = buildPromptSections({
    handoff: options.handoff,
    summary: options.summary,
    facts: options.facts,
    staffInstruction: options.staffInstruction,
  });

  return fillTemplate(prompt?.system_prompt_template ?? "", {
    display_name: tenant?.display_name ?? "the team",
    language: tenant?.language ?? "en",
    timezone: tenant?.timezone ?? "UTC",
    today,
    rules: prompt?.rules_markdown ?? businessRules ?? "",
    owner_profile: ownerProfile ?? "",
    ...sections,
  });
}

export async function buildOwnerProfileFromOwnerId(supabase, ownerId, phone) {
  if (!ownerId) return `Unknown owner (phone: ${phone})`;

  const { data: owner } = await supabase
    .from("owners")
    .select(`
      first_name, last_name, phone, member_type, wallet_balance,
      pets(id, name, species, breed, assessment_status)
    `)
    .eq("id", ownerId)
    .single();

  if (!owner) return `Unknown owner (phone: ${phone})`;

  const petList = (owner.pets ?? [])
    .map(
      (p) =>
        `${p.name} (${p.species}, ${p.breed ?? "breed unknown"}, assessment: ${p.assessment_status})`,
    )
    .join("\n  ");

  return `Name: ${owner.first_name} ${owner.last_name ?? ""}
Phone: ${owner.phone}
Membership: ${owner.member_type}
Wallet: AED ${owner.wallet_balance ?? 0}
Pets:
  ${petList || "No pets on file"}`;
}

export function createAgentRunner({
  supabase,
  anthropic,
  model,
  maxTokens = 1024,
  maxToolRounds = 4,
  getTenant,
  getPrompt,
  getBusinessRules,
  getToolDefinitions,
  getFallbackString,
  executeTool,
  ownerResolver,
  conversation,
  facts: factsLib,
}) {
  // Resolve owner + cache profile on the conversation row. Returns
  // { ownerId, ownerProfile, ownerMatchSource } -- the same shape the legacy
  // implementation returned.
  async function getOwnerContext(phone, conv) {
    let ownerId = conv?.owner_id ?? null;
    let ownerMatchSource = "conversation_owner_id";

    if (!ownerId) {
      const resolution = await ownerResolver.resolveOwnerForTargetJid(phone);
      if (resolution?.ownerId) {
        ownerId = resolution.ownerId;
        ownerMatchSource = resolution.source;
        await supabase
          .from("agent_conversations")
          .update({ owner_id: ownerId })
          .eq("phone_number", phone);
        if (resolution.bridgedPhone) {
          await supabase
            .from("agent_conversations")
            .update({ owner_id: ownerId })
            .eq("phone_number", resolution.bridgedPhone);
        }
      } else {
        ownerMatchSource = "no_owner_match";
      }
    }

    let ownerProfile;
    if (conv?.owner_profile && ownerId) {
      ownerProfile = conv.owner_profile;
      ownerMatchSource = `${ownerMatchSource}+cached_profile`;
    } else {
      ownerProfile = await buildOwnerProfileFromOwnerId(supabase, ownerId, phone);
      if (ownerProfile.startsWith("Unknown owner")) {
        ownerProfile = factsLib.historyFallbackOwnerProfile(phone, conv?.history ?? []);
        ownerMatchSource = `${ownerMatchSource}+history_fallback`;
      } else {
        ownerMatchSource = `${ownerMatchSource}+db_profile`;
      }
      await supabase
        .from("agent_conversations")
        .update({ owner_profile: ownerProfile, owner_id: ownerId })
        .eq("phone_number", phone);
    }

    console.log("Owner context source:", { phone, owner_id: ownerId, source: ownerMatchSource });
    return { ownerId, ownerProfile, ownerMatchSource };
  }

  async function runAgent(phone, message, options = {}) {
    const tenant = getTenant();
    const prompt = getPrompt();
    const businessRules = getBusinessRules();
    const startedAt = Date.now();

    let { data: conv } = await supabase
      .from("agent_conversations")
      .select("*")
      .eq("phone_number", phone)
      .single();

    if (!conv) {
      const { data: newConv } = await supabase
        .from("agent_conversations")
        .insert({
          phone_number: phone,
          tenant_id: tenant?.id ?? null,
          owner_id: null,
          mode: "agent",
          state: "agent",
          history: [],
          facts: {},
        })
        .select()
        .single();
      conv = newConv;
    }

    const history = options.overrideHistory ?? conv?.history ?? [];
    const { ownerProfile, ownerMatchSource } = await getOwnerContext(phone, conv);

    const rollup = await maybeRollupHistory({
      history,
      existingSummary: conv?.facts?.summary ?? null,
      anthropic,
      model,
    });

    if (rollup.rolled) {
      const persistedFacts = {
        ...(conv?.facts ?? {}),
        summary: rollup.summary,
        summary_updated_at: new Date().toISOString(),
      };
      const { error: rollupErr } = await supabase
        .from("agent_conversations")
        .update({ history: rollup.history, facts: persistedFacts })
        .eq("phone_number", phone);
      if (rollupErr) {
        console.error("History rollup persist failed:", { phone, error: rollupErr.message });
      } else {
        conv = { ...(conv ?? {}), history: rollup.history, facts: persistedFacts };
        await logAgentEvent(supabase, {
          tenant_id: tenant?.id ?? null,
          chat_id: phone,
          event: "history_compacted",
          payload: {
            kept: rollup.history.length,
            summary_chars: typeof rollup.summary === "string" ? rollup.summary.length : 0,
          },
        });
      }
    }

    const baseFacts = factsLib.extractConversationFacts(
      conv?.facts,
      rollup.history,
      message,
      options.handoff,
      { lastSeenJid: options.lastSeenJid },
    );
    const updatedFacts = rollup.summary
      ? { ...baseFacts, summary: rollup.summary, summary_updated_at: new Date().toISOString() }
      : baseFacts;

    if (options.handoff?.pending_request) {
      console.log("First-turn handoff source:", {
        phone,
        ownerMatchSource,
        pending_request: options.handoff.pending_request.slice(0, 120),
      });
    }

    await logAgentEvent(supabase, {
      tenant_id: tenant?.id ?? null,
      chat_id: phone,
      event: "inbound",
      payload: {
        length: typeof message === "string" ? message.length : null,
        ownerMatchSource,
      },
    });

    const incoming = { role: "user", content: message };
    const lastHistory = rollup.history.at(-1);
    const incomingAlreadyPresent =
      lastHistory?.role === "user" &&
      typeof lastHistory?.content === "string" &&
      lastHistory.content.trim() === message.trim();
    const claudeMessages = incomingAlreadyPresent
      ? [...rollup.history]
      : [...rollup.history, incoming];

    const systemPrompt = buildSystemPrompt({
      tenant,
      prompt,
      businessRules,
      ownerProfile,
      options: {
        handoff: options.handoff,
        facts: updatedFacts,
        summary: rollup.summary,
        staffInstruction: options.staffInstruction,
      },
    });

    const allTools = getToolDefinitions();
    const toolsForTurn = updatedFacts.awaiting_staff_direction ? [] : allTools;

    let currentMessages = [...claudeMessages];
    let finalText = "";
    const toolTrace = [];
    let toolRounds = 0;
    let blockedReason = null;
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: toolsForTurn,
        messages: currentMessages,
      });

      inputTokens += response?.usage?.input_tokens ?? 0;
      outputTokens += response?.usage?.output_tokens ?? 0;

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        if (toolRounds >= maxToolRounds) {
          blockedReason = "tool_round_limit_reached";
          finalText = getFallbackString("fallback_processing");
          toolTrace.push("tool_round_limit_reached");
          break;
        }
        toolRounds += 1;
        const toolBlocks = response.content.filter((b) => b.type === "tool_use");

        const toolResults = await Promise.all(
          toolBlocks.map(async (block) => {
            const out = await executeTool(block.name, block.input, phone);
            const summary = summarizeToolResult(out);
            toolTrace.push(`${block.name}: ${summary}`);
            await logAgentEvent(supabase, {
              tenant_id: tenant?.id ?? null,
              chat_id: phone,
              event: "tool_call",
              payload: { name: block.name, summary },
            });
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(out),
            };
          }),
        );

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      blockedReason = `unexpected_stop_reason:${response.stop_reason ?? "unknown"}`;
      finalText = getFallbackString("fallback_processing");
      break;
    }

    const lastAssistantMessage = [...claudeMessages]
      .reverse()
      .find((m) => m?.role === "assistant" && typeof m?.content === "string")?.content;
    if (
      typeof lastAssistantMessage === "string" &&
      lastAssistantMessage.trim() === finalText.trim()
    ) {
      finalText = getFallbackString("fallback_repeat");
    }

    if (blockedReason) {
      console.warn("Agent blocked; escalating to staff:", {
        phone,
        reason: blockedReason,
        toolTrace: toolTrace.slice(-4),
      });
      await executeTool(
        "escalate_to_human",
        {
          reason: blockedReason,
          summary:
            `Owner message: ${String(message).slice(0, 200)}\n` +
            `Phone: ${phone}\n` +
            `Tool trace: ${toolTrace.join(" | ").slice(0, 400) || "none"}`,
        },
        phone,
      );
    }

    const updatedHistory = [
      ...claudeMessages,
      { role: "assistant", content: finalText },
    ].slice(-Math.max(HISTORY_KEEP_TURNS + 4, 30));

    await supabase
      .from("agent_conversations")
      .update({
        history: updatedHistory,
        facts: updatedFacts,
        tenant_id: conv?.tenant_id ?? tenant?.id ?? null,
      })
      .eq("phone_number", phone);

    await recordAgentTurn(supabase, {
      tenant_id: tenant?.id ?? null,
      chat_id: phone,
      conversation_phone: phone,
      latency_ms: Date.now() - startedAt,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      tool_trace: toolTrace.join(" | ").slice(0, 1000),
      outcome: blockedReason ? "blocked" : "responded",
      blocked_reason: blockedReason,
      message_in: typeof message === "string" ? message : null,
      message_out: typeof finalText === "string" ? finalText : null,
      escalated: Boolean(blockedReason),
      metadata: { tool_rounds: toolRounds, summary_rolled: rollup.rolled },
    });

    if (tenant?.daily_token_cap) invalidateBudgetCache(tenant.id);

    return finalText;
  }

  return { runAgent, getOwnerContext };
}
