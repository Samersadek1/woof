# Admin Essentials

This repository hosts multiple independently deployed services that share the same Supabase project.

## Repository Layout

- `src/` - React/Vite admin application.
- `supabase/functions/` - Supabase Edge Functions.
- `whatsapp-agent/` - standalone Node.js WhatsApp worker service.

## Deployment Boundaries

- Vercel deploys the root React/Vite project only.
- Railway deploys only the `whatsapp-agent/` subdirectory.
- Supabase deploys edge functions from `supabase/functions/`.

Each deployment is isolated: a deploy or crash in one service does not restart or redeploy the others.
