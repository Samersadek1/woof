# WhatsApp Agent

Multi-tenant WhatsApp agent runtime. Each business runs its own Railway service
configured by a row in `public.tenants` plus its own active prompt and tool
allow-list. The first tenant in this repo is `msh` (MySecondHome).

## Setup

cd whatsapp-agent
npm install
cp .env.example .env
# Fill in .env values

## Required environment variables

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `TENANT_SLUG` (matches `public.tenants.slug`, defaults to `msh`)

## Optional environment variables

- `STAFF_GROUP_ID` (overrides `tenants.staff_group_id` for the running service)
- `WA_SESSION_CLIENT_ID` (overrides `tenants.wa_session_client_id`; defaults to `<tenant_slug>-whatsapp-main`)
- `CHROME_EXECUTABLE_PATH` (only if you need a custom browser binary path)
- `AGENT_HISTORY_KEEP_TURNS` (verbatim turns kept per chat, default 16)
- `AGENT_HISTORY_SUMMARY_TRIGGER` (turn count that triggers rollup, default 24)

## First run (get QR code + group IDs)

npm start
# Scan the QR code with your WhatsApp Business phone
# Terminal prints all group IDs -- copy your staff group ID to .env
# Restart: npm start

## Commands (send in staff WhatsApp group)

!bot +971XXXXXXXXX       activate agent for this owner
!human +971XXXXXXXXX     return conversation to receptionist
!confirm <REF>           confirm a draft booking (owner notified)
!reject <REF> [reason]   cancel a draft (owner notified)

Replying directly to a bot escalation message in the staff group sends that
text as private guidance to the bot for the routed phone.

## Adding a new tenant (per-tenant Railway service)

1. Author a tenant JSON file. Start from
   [scripts/sample-tenant.json](scripts/sample-tenant.json) and edit:
   - `slug`, `display_name`, `language`, `timezone`
   - `staff_group_id`, `wa_session_client_id`
   - `booking_ref_prefix`, `default_mode`, `daily_token_cap`
   - `prompt.system_prompt_template` (use `{{display_name}}`, `{{rules}}`,
     `{{owner_profile}}`, `{{handoff_section}}`, `{{summary_section}}`,
     `{{facts_section}}`, `{{staff_direction_section}}`,
     `{{escalation_hold_section}}`, `{{today}}`)
   - `tools` allow-list
2. Seed it into Supabase:

```
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  npm run tenant:seed -- scripts/your-tenant.json
```

3. Insert business rules content into `system_context` for that tenant:

```
INSERT INTO public.system_context (tenant_id, key, content)
SELECT id, 'business_rules', $$...your rules...$$
FROM public.tenants WHERE slug = '<your-slug>';
```

4. Create a private Supabase storage bucket `whatsapp-sessions` (shared across
   tenants is fine -- session zip filename is keyed off
   `wa_session_client_id`).
5. Create a new Railway service from this repo with env:
   - `TENANT_SLUG=<your-slug>`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`
   - `STAFF_GROUP_ID` (optional override)
   - `WA_SESSION_CLIENT_ID` (optional override)
6. Deploy and scan the QR code once for that tenant's WhatsApp number.

## Per-tenant safety nets in this runtime

- Per-chat lock: messages on the same conversation are processed serially.
- History rollup: older turns are summarized and stored on `facts.summary`.
- Token + latency capture: every turn lands in `public.agent_turns`.
- Daily token cap: `tenants.daily_token_cap` triggers human mode and a staff
  notification when exceeded.
- Structured event log: `public.agent_events` records inbound/outbound,
  tool calls, escalations, and state changes.

## Replay a conversation against the current prompt/tools

```
TENANT_SLUG=msh SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ANTHROPIC_API_KEY=... \
  npm run tenant:replay -- --phone "<conversation_phone>"
```

This does not modify any rows or send any WhatsApp messages -- it only prints
the model's output and tool calls for the latest user turn in stored history.

## Continuous Railway log checks

Use this when you want ongoing production verification from Railway logs.

1. Authenticate Railway CLI once on your machine:
   - `railway login`
2. Configure watcher env vars in `whatsapp-agent/.env`:
   - `RAILWAY_SERVICE` (required unless using `RAILWAY_LOG_COMMAND`)
   - `RAILWAY_ENVIRONMENT` (optional)
   - `TENANT_SLUG` (optional, included in alert output for context)
3. Run the watcher:
   - Continuous: `npm run railway:watch`
   - One-shot check (CI-friendly): `npm run railway:check`

What the watcher does:
- Pulls recent logs from Railway on a loop.
- Tracks a cursor in `.railway-log-state.json` so only new logs are evaluated.
- Flags critical issues like:
  - blocked turns without matching escalations,
  - `authenticated` without `ready`,
  - repeated `ownerId: null` owner-matching failures,
  - daily token cap reached events,
  - tenant load failures.
- Prints warning-level signals for repeated recoveries and heavy fallback routing.

For strict CI pipelines, run `npm run railway:check`; it exits non-zero on critical alerts.

## How it works

Owners WhatsApp the tenant number.
By default all conversations are in human mode (receptionist handles).
Receptionist types !bot +971XXXXXXXXX in the staff group to activate the agent.
Agent handles the conversation, creates draft bookings if needed.
Receptionist confirms drafts with !confirm in the staff group.
Receptionist can reclaim any conversation with !human at any time.
