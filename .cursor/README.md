# Cursor setup for this repo

## Supabase MCP

The `mcp.example.json` in this folder is a template that wires Cursor to
[Supabase's official MCP server](https://supabase.com/docs/guides/getting-started/mcp)
so the agent can introspect the DB, apply migrations, and regenerate types
directly from chat.

**Never commit `mcp.json`** — it contains a Personal Access Token. It is
gitignored.

### One-time setup

1. **Generate a Personal Access Token**
   - Go to https://supabase.com/dashboard/account/tokens
   - Click *Generate new token*, name it `cursor-mcp`
   - Copy the token (shown only once). It starts with `sbp_`.

2. **Create your local `mcp.json` from the template**
   ```bash
   cp .cursor/mcp.example.json .cursor/mcp.json
   ```

3. **Paste the token into `.cursor/mcp.json`**
   Open `.cursor/mcp.json` and replace
   `REPLACE_WITH_YOUR_PERSONAL_ACCESS_TOKEN` with your real `sbp_...` token.
   Save and close.

4. **Enable the server in Cursor**
   - Reload Cursor (or: Command Palette → *Developer: Reload Window*)
   - Cursor Settings → **MCP** — you should see `supabase` with a green dot
   - Start a new chat; the agent will have access to Supabase tools

### Read-only vs. write

The template ships with `--read-only` on, so the first session can inspect the
DB without any risk of accidental writes. When you are ready to let the agent
apply migrations (e.g. during the pricing restructure), edit `.cursor/mcp.json`
and remove the `"--read-only",` line, then reload Cursor.

### Revoking access

- Dashboard → *Account → Access Tokens* → **Revoke** the `cursor-mcp` token.
  The server stops working immediately. Regenerate and update `mcp.json` to
  restore.

### Alternative: keep token out of the file entirely (macOS)

If you would prefer not to store the token in `mcp.json` at all, you can put it
in a global env var that Cursor's MCP subprocesses inherit:

```bash
launchctl setenv SUPABASE_ACCESS_TOKEN "sbp_your_token_here"
```

Then delete the `env` block from `.cursor/mcp.json` so the subprocess picks up
the global value instead. Re-run `launchctl setenv` after each reboot, or add a
`LaunchAgent` plist if you want it permanent. Verify with `launchctl getenv
SUPABASE_ACCESS_TOKEN` from a terminal after a Cursor restart.
