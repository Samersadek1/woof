# Woof — setup (copied from admin-essentials)

Woof is a **separate codebase** and **separate Supabase project**. It does not share data with MSH / admin-essentials.

## 1. Cursor project

Open this folder as its own project:

**File → Open Folder →** `~/Desktop/woof`

Do not reuse `admin-essentials` `.env` or Supabase keys.

## 2. New Supabase project

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** (e.g. `woof`).
2. Copy **Project URL**, **publishable/anon key**, and **service role key**.
3. From this folder:

```bash
cd ~/Desktop/woof
cp .env.example .env
# Edit .env with woof project values only

npx supabase login
npx supabase link --project-ref YOUR_WOOF_PROJECT_REF
npx supabase db push
```

That applies `supabase/migrations/` to an **empty** database (schema only, no MSH customers).

### Do not run on woof (unless you want demo data)

| Item | Why |
|------|-----|
| MSH `output/` / `staging/` | PetExec import artifacts |
| `npm run msh:import:*` | Loads Main Branch customer/boarding data |
| `seed.sql` | Dummy owners/pets (optional for local demos only) |
| `admin-essentials` `.env` | Points at production MSH data |

### Staff login

Create staff users in the **woof** project under **Authentication**. MSH `auth.users` are not copied.

## 3. Install and run

```bash
npm install
npm run dev
```

## 4. Git remote (new repo)

This copy has **no `origin`** (detached from admin-essentials). Create a new GitHub repo and:

```bash
git remote add origin git@github.com:YOUR_ORG/woof.git
git push -u origin main
```

## 5. MSH-only code (removed in this fork)

PetExec / Main Branch import UI, scripts, CSV data, and `msh:import:*` npm scripts were removed from woof. MSH continues to use those in `admin-essentials` only.

Keep shared base: hooks, rooms, boarding calendar patterns, pricing tables, UI components — then change flows and pricing for woof.

## 6. Deployments

| Service | Woof |
|---------|------|
| Vercel | New project, env from woof Supabase |
| Supabase Functions | `supabase functions deploy` linked to woof |
| `whatsapp-agent/` | New Railway service + woof env (if used) |
