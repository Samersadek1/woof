# woof — setup

woof is a **separate codebase** and **separate Supabase project**. It does not
share data or credentials with any other deployment.

## 1. Open in Cursor / your editor

**File → Open Folder →** `~/Desktop/woof` (or wherever the repo lives).

## 2. Supabase project

A Supabase project for woof has already been created and the baseline schema
has been applied (45 tables, 19 enums, 30 user functions, 15 triggers, 36 RLS
policies). `supabase/migrations/` is intentionally empty — the baseline lives
on the remote and is tracked by Supabase.

To add new schema changes:

The woof project ref is `wineliuwejkxwsdbrthb` (also pinned in
`supabase/config.toml`).

```bash
# Make sure you are linked to the woof project (one-time per machine):
npx supabase link --project-ref wineliuwejkxwsdbrthb

# Create a new migration and push:
npx supabase migration new add_<thing>
# Edit the generated .sql under supabase/migrations/
npx supabase db push
```

If you ever need a local snapshot of the live schema, run
`npx supabase db pull --schema public` after linking.

### Environment

```bash
cd ~/Desktop/woof
cp .env.example .env
# Fill in:
#   VITE_SUPABASE_URL / SUPABASE_URL
#   VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_PUBLISHABLE_KEY
#   SUPABASE_SERVICE_ROLE_KEY (server-only)
```

### Optional seed data

The repo contains a few SQL files for demos and reference:

| File | Purpose |
|------|---------|
| `seed.sql` | Dummy owners / pets / bookings (uses `WOOF-YYYY-NNNNN` refs) |
| `seed-grooming-today.sql` | Adds a handful of same-day grooming slots |
| `sql/seed-reference-lists.sql` | Vet clinics and similar dropdowns |
| `sql/seed-pricing-2026-04-01.sql` | Reference pricing seed |

Run them via the Supabase SQL editor or `psql` against the woof project. They
are **not** auto-applied.

### Staff login

Create staff users in the **woof** Supabase project under **Authentication →
Users**. No accounts are inherited from any other project.

### Staff invite links (production URL)

Invites use `APP_BASE_URL` (Vercel) and Supabase **Site URL** / **Redirect URLs**.
If emails point at `localhost`, fix both:

1. **Vercel** — set `APP_BASE_URL` to your deployed origin (no trailing slash),
   e.g. `https://woof-neon.vercel.app`, for Production and Preview.
2. **Supabase** — Authentication → URL Configuration:
   - **Site URL:** same as `APP_BASE_URL`
   - **Redirect URLs:** include `${APP_BASE_URL}/**` and `http://localhost:8080/**`

Or run (needs a [personal access token](https://supabase.com/dashboard/account/tokens)):

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
./scripts/configure-supabase-auth-urls.sh
```

## 3. Install and run

```bash
npm install
npm run dev
```

## 4. Git remote

This copy has no `origin` by default. To push to a new GitHub repo:

```bash
git remote add origin git@github.com:YOUR_ORG/woof.git
git push -u origin main
```

## 5. Deployments

| Service | Notes |
|---------|------|
| Vercel | Deploy root React/Vite project. Env from woof Supabase. |
| Supabase Functions | `npx supabase functions deploy agent-chat` linked to woof. |
| `whatsapp-agent/` | New Railway service. Env at `whatsapp-agent/.env.example`. |

## 6. Branding

woof uses the `WOOF-YYYY-NNNNN` booking-ref format (set in
`public.generate_booking_ref` / `public.generate_booking_ref_trigger`). Change
those two functions if you want a different prefix.
