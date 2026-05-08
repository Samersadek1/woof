// Seed a new tenant + active prompt + tool allow-list from a JSON file.
//
// Usage:
//   node scripts/seed-tenant.mjs path/to/tenant.json
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).
//
// JSON shape:
// {
//   "slug": "msh",
//   "display_name": "MySecondHome",
//   "language": "en",
//   "timezone": "Asia/Dubai",
//   "staff_group_id": "120363408763975833@g.us",
//   "wa_session_client_id": "msh-whatsapp-main",
//   "booking_ref_prefix": "MSH",
//   "default_mode": "human",
//   "daily_token_cap": 500000,
//   "prompt": {
//     "version": 1,
//     "system_prompt_template": "You are the {{display_name}} assistant ...",
//     "rules_markdown": "...",
//     "fallback_strings": {
//       "fallback_processing": "...",
//       "fallback_repeat": "...",
//       "fallback_error": "..."
//     }
//   },
//   "tools": [
//     { "tool_name": "query_database", "permissions": "read" },
//     { "tool_name": "call_rpc", "permissions": "read" },
//     { "tool_name": "create_draft_booking", "permissions": "write" },
//     { "tool_name": "escalate_to_human", "permissions": "escalation" }
//   ]
// }

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/seed-tenant.mjs <tenant.json>");
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY env.");
    process.exit(1);
  }

  const raw = await readFile(resolve(process.cwd(), file), "utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON in tenant file:", err.message);
    process.exit(1);
  }

  if (!payload?.slug || !payload?.display_name) {
    console.error("Tenant JSON requires slug and display_name.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const tenantRow = {
    slug: payload.slug,
    display_name: payload.display_name,
    language: payload.language ?? "en",
    timezone: payload.timezone ?? "UTC",
    staff_group_id: payload.staff_group_id ?? null,
    wa_session_client_id: payload.wa_session_client_id ?? `${payload.slug}-whatsapp-main`,
    booking_ref_prefix: payload.booking_ref_prefix ?? null,
    default_mode: payload.default_mode ?? "human",
    daily_token_cap: payload.daily_token_cap ?? null,
    escalation_policy: payload.escalation_policy ?? {},
    metadata: payload.metadata ?? {},
  };

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .upsert(tenantRow, { onConflict: "slug" })
    .select("*")
    .single();
  if (tenantErr) {
    console.error("Failed to upsert tenant:", tenantErr.message);
    process.exit(1);
  }
  console.log("Tenant seeded:", { id: tenant.id, slug: tenant.slug });

  if (payload.prompt?.system_prompt_template) {
    const { error: promptErr } = await supabase
      .from("tenant_prompts")
      .upsert(
        {
          tenant_id: tenant.id,
          version: payload.prompt.version ?? 1,
          is_active: true,
          system_prompt_template: payload.prompt.system_prompt_template,
          rules_markdown: payload.prompt.rules_markdown ?? null,
          fallback_strings: payload.prompt.fallback_strings ?? {},
        },
        { onConflict: "tenant_id,version" }
      );
    if (promptErr) {
      console.error("Failed to upsert prompt:", promptErr.message);
      process.exit(1);
    }
    console.log("Tenant prompt seeded.");
  }

  for (const tool of payload.tools ?? []) {
    if (!tool?.tool_name) continue;
    const { error: toolErr } = await supabase
      .from("tenant_tools")
      .upsert(
        {
          tenant_id: tenant.id,
          tool_name: tool.tool_name,
          enabled: tool.enabled ?? true,
          permissions: tool.permissions ?? "read",
          description_override: tool.description_override ?? null,
          schema_override: tool.schema_override ?? null,
          config: tool.config ?? {},
        },
        { onConflict: "tenant_id,tool_name" }
      );
    if (toolErr) {
      console.error(`Failed to upsert tool '${tool.tool_name}':`, toolErr.message);
      process.exit(1);
    }
    console.log("Tool seeded:", tool.tool_name);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("seed-tenant failed:", err);
  process.exit(1);
});
