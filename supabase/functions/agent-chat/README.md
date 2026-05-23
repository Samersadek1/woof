# agent-chat edge function

Proxies Claude API calls from the woof admin UI.
Requires an authenticated Supabase session.

## Setup (run once)
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_key_here

## Deploy
supabase functions deploy agent-chat

## Local dev
supabase functions serve agent-chat --env-file .env.local

## Environment variables (set automatically by Supabase runtime)
- SUPABASE_URL
- SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY (must be set manually via supabase secrets set)

## Optional performance flags
- AGENT_CHAT_MODEL (default `claude-sonnet-4-20250514`)
- AGENT_CHAT_LOW_COMPLEXITY_MODEL (optional faster model for simple chat turns)
- AGENT_CHAT_MAX_TOKENS (default `4096`)
- AGENT_CHAT_QUERY_DEFAULT_LIMIT (default `25`)
- AGENT_CHAT_QUERY_MAX_LIMIT (default `120`)
- AGENT_CHAT_MAX_TOOL_ROUNDS (default `3`)
- AGENT_CHAT_CONTEXT_MAX_CHARS (default `24000`)
- AGENT_CHAT_SCHEMA_MAX_CHARS (default `14000`)
- AGENT_CHAT_GUIDELINES_MAX_CHARS (default `5000`)
- AGENT_CHAT_RULES_MAX_CHARS (default `7000`)
- AGENT_CHAT_TOOL_RESULT_MAX_CHARS (default `6000`)
- AGENT_CHAT_TOOL_RESULT_PREVIEW_ROWS (default `20`)
- AGENT_CHAT_ENABLE_FAST_SNAPSHOT (default `true`)
- AGENT_CHAT_SNAPSHOT_EVERY_USER_TURNS (default `3`)
- AGENT_CHAT_SNAPSHOT_TTL_MS (default `30000`)

The function emits a structured `agent-chat perf` log per request with stage timings, tool rounds, and payload size to support p50/p95 tracking.

## Quick benchmark loop
1. Run a fixed set of prompts 10-20 times each (simple greeting, dashboard summary, multi-step booking lookup).
2. Capture `agent-chat perf` logs and compare:
   - `total_ms` p50/p95
   - `claude_rounds` and `tool_rounds`
   - `tool_payload_chars`
3. Roll out changes safely by toggling flags one at a time:
   - `AGENT_CHAT_ENABLE_FAST_SNAPSHOT`
   - `AGENT_CHAT_QUERY_DEFAULT_LIMIT`
   - `AGENT_CHAT_MAX_TOOL_ROUNDS`
   - `AGENT_CHAT_LOW_COMPLEXITY_MODEL`
