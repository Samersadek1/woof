# CLAUDE.md — woof

Shared brief for AI assistants (Claude Code, Cowork, Cursor) working in this repo. `.cursor/rules/woof.mdc` is the same rules file Cursor's agent loads.

## What this repo is

**woof** is a staff-facing kennel admin app. It is a **separate codebase** and a **separate Supabase project** (`wineliuwejkxwsdbrthb`) from any sibling system. Do not share schemas, seed data, env vars, or assumptions across projects.

Bookings use the `WOOF-YYYY-NNNNN` reference format (generated in `public.generate_booking_ref`).

## Stack

- **Frontend:** React + TypeScript + Vite + shadcn/ui + Tailwind + TanStack React Query. Dev at `localhost:8080`.
- **Backend:** Supabase project `wineliuwejkxwsdbrthb`. Generated types live in `src/integrations/supabase/types.ts`.
- **API routes:** Vercel serverless functions under `api/`.
- **Edge functions:** `supabase/functions/` (currently `agent-chat`).
- **WhatsApp worker:** standalone Node service in `whatsapp-agent/`, deployed to Railway.
- **Tests:** Vitest (`unit` + `db` projects) + Playwright E2E.
- **Env vars:** see `.env.example`. Key ones: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `WHATSAPP_BRIDGE_SECRET`.

## Repository layout

```
src/                      React/Vite admin app (pages, components, hooks, contexts)
api/                      Vercel serverless routes
supabase/functions/       Supabase Edge Functions (deploys independently)
supabase/migrations/      Schema migrations (baseline lives on remote)
whatsapp-agent/           Node WhatsApp worker (Railway deploy, separate from src/)
migration/                Legacy import staging + scripts
sql/                      One-off SQL scripts and seed files
docs/                     Project docs (setup, QA flows, test runs)
.cursor/rules/            Cursor agent rules (woof.mdc)
scripts/                  Local tooling (e.g. open-in-cursor.sh)
tests/                    Playwright E2E
```

## Deployment boundaries

| Service | Deploys | Notes |
|---|---|---|
| Vercel | Root Vite app | Env wired to the woof Supabase project |
| Supabase | `supabase/functions/*` | `npx supabase functions deploy <name>` |
| Railway | `whatsapp-agent/` subdir only | Separate process; does not import from `src/` and vice versa |

A deploy or crash in one service does not restart or redeploy the others.

## How AI assistants should operate

1. **Re-verify schema before writing SQL.** Pull column names from the live Supabase project, not from memory. Cursor's Supabase MCP (see `.cursor/README.md`) is the recommended path.
2. **Idempotent, defensive SQL only.** `CREATE OR REPLACE`, `CREATE TABLE IF NOT EXISTS`, and for enum additions: `DO $$ BEGIN ALTER TYPE x ADD VALUE 'y'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;` — not `IF NOT EXISTS`, which is unsupported on older Postgres.
3. **Enum additions must commit before use** — keep `ALTER TYPE ... ADD VALUE` in a separate statement from anything that consumes the new value.
4. **End schema-changing prompts with a verification SELECT** the user can paste into the Supabase SQL editor to prove the change applied.
5. **Samer runs SQL directly** in the Supabase SQL editor and pastes results back. Do not assume autonomous write access.
6. **Schema is ground truth.** If a hook/component references a column that the live schema does not have, stop and ask — do not invent.
7. **E2E selectors** are `data-testid` on elements automated tests must target. Pattern: `<page>-<element-purpose>` (e.g. `boarding-new-booking-btn`). Include entity context (owner vs pet) where ambiguous. See `.cursor/rules/woof.mdc`.

## Cowork ↔ Cursor workflow

**Cowork holds the plan and reviews. Cursor's agent executes the edits.**

This division is the default for substantive work in this repo. Cowork (Claude desktop) is the brain — it plans, holds the project's expectations, drafts prompts, and reviews diffs against the plan. Cursor's agent is the hands — it does the actual file edits inside Cursor's editor.

### The loop

1. Samer states a goal in Cowork (e.g. *"add a wallet refund button to the checkout sheet"*).
2. Cowork drafts a Cursor-ready prompt: explicit file paths, expected behaviors, edge cases, and adherence to `.cursor/rules/woof.mdc`. The prompt is presented in chat as a single copyable code block.
3. Samer pastes the prompt into Cursor's agent (`⌘L` → paste → Enter). Cursor edits files.
4. Samer tells Cowork "done", or Cowork checks `git status` / reads the diff directly.
5. Cowork reviews against the original expectations: missed edge cases, wrong column names, scope creep, missing tests.
6. If gaps exist, Cowork drafts the next prompt. Loop to step 3.

**Cowork edits files directly only for trivial mechanical changes** — single-line typos, simple renames, formatting nits. Everything substantive goes through Cursor.

### Handing off a file (interactive mode)

```bash
./scripts/open-in-cursor.sh                          # open the whole repo
./scripts/open-in-cursor.sh src/hooks/useBookings.ts # open a specific file
./scripts/open-in-cursor.sh --diff                   # open everything in the current diff
./scripts/open-in-cursor.sh --branch                 # open everything changed vs main
./scripts/open-in-cursor.sh --line FILE:LINE         # open at a specific line
```

Requires the `cursor` CLI on PATH (one-time: in Cursor, `⌘⇧P` → "Shell Command: Install 'cursor' command").

### Autonomous mode (Cowork drives, `cursor-agent` executes)

When Samer wants to step away while a multi-step task runs, the loop becomes fully unattended:

1. Samer starts the watcher once in a Terminal: `./scripts/agent-watcher.sh` (leave it running; Ctrl-C or `touch .cursor-queue/STOP` to halt).
2. Cowork drops a prompt at `.cursor-queue/pending/NNN-slug.prompt.md`.
3. The watcher pipes the prompt body to `cursor-agent -p`, commits the diff with message `agent: NNN-slug`, and writes `.cursor-queue/done/NNN-slug/.complete`.
4. Cowork polls for `.complete`, reads `done/NNN-slug/result.md` + the git diff, reviews against the original plan.
5. If gaps exist, Cowork drops the next prompt. Loop.

Stop conditions Cowork honors:
- `touch .cursor-queue/STOP` — halts at the next iteration boundary
- Timer (Samer specifies max minutes when triggering)
- Target reached (Cowork's review judges the plan complete)
- Max iterations (default 10 unless Samer overrides)

Requires `cursor-agent` (separate from `cursor`): `curl https://cursor.com/install -fsSL | bash`.

See `.cursor-queue/README.md` for the full layout.

## Out of scope

woof is not MSH and does not share data, schema, or business rules with MSH. Anything labelled MSH belongs in a separate repo and Claude project.
