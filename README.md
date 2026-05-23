# Woof

Kennel admin app — **separate codebase** copied from [admin-essentials](https://github.com/Samersadek1/admin-essentials). Uses its **own Supabase project** (no MSH customer data).

Setup: [docs/WOOF_SETUP.md](docs/WOOF_SETUP.md)

---

This repository hosts multiple independently deployed services that share the same Supabase project (per deployment).

## Repository Layout

- `src/` - React/Vite admin application.
- `supabase/functions/` - Supabase Edge Functions.
- `whatsapp-agent/` - standalone Node.js WhatsApp worker service.

## Deployment Boundaries

- Vercel deploys the root React/Vite project only.
- Railway deploys only the `whatsapp-agent/` subdirectory.
- Supabase deploys edge functions from `supabase/functions/`.

Each deployment is isolated: a deploy or crash in one service does not restart or redeploy the others.
