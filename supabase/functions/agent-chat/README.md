# agent-chat edge function

Proxies Claude API calls from the MSH admin UI.
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
