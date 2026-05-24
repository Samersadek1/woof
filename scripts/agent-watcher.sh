#!/usr/bin/env bash
# agent-watcher.sh — runs on Samer's Mac. Polls .cursor-queue/pending/
# for prompt files dropped by Cowork-side Claude, executes them via
# `cursor-agent -p`, commits the diff, signals completion. Halts when
# .cursor-queue/STOP exists (after finishing any in-flight task).
#
# Usage:
#   ./scripts/agent-watcher.sh                # poll forever (Ctrl-C to stop)
#   ./scripts/agent-watcher.sh --once         # process one task then exit
#   POLL_INTERVAL_SEC=5 ./scripts/agent-watcher.sh
#
# Requires: cursor-agent on PATH. Install: curl https://cursor.com/install -fsSL | bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE="$REPO_ROOT/.cursor-queue"
PENDING="$QUEUE/pending"
DONE="$QUEUE/done"
LOG="$QUEUE/logs/agent-watcher.log"
STOP="$QUEUE/STOP"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-3}"
ONCE=0
[[ "${1:-}" == "--once" ]] && ONCE=1

mkdir -p "$PENDING" "$DONE" "$(dirname "$LOG")"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

# Cursor's CLI is shipped under either name depending on installer / version.
# Prefer cursor-agent (the documented headless name), fall back to `agent`.
if command -v cursor-agent >/dev/null 2>&1; then
  AGENT_BIN="cursor-agent"
elif command -v agent >/dev/null 2>&1; then
  AGENT_BIN="agent"
else
  log "error: neither 'cursor-agent' nor 'agent' found on PATH"
  log "       installer puts it under ~/.local/bin — make sure that's on PATH:"
  log "         echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
  exit 127
fi
log "using agent binary: $(command -v "$AGENT_BIN")"

cd "$REPO_ROOT"

log "watcher started (pid $$). polling $PENDING every ${POLL_INTERVAL_SEC}s."
log "stop with: touch $STOP   (or Ctrl-C in this terminal)"

# True if the working tree (including untracked files outside .cursor-queue) is clean.
tree_is_clean() {
  # Exclude .cursor-queue/ from the cleanliness check — it's allowed to be dirty.
  local dirty
  dirty="$(git -C "$REPO_ROOT" status --porcelain -- ':!.cursor-queue' 2>&1)"
  [[ -z "$dirty" ]]
}

# Process a single prompt file. Returns 0 on success, non-zero otherwise.
process_one() {
  local prompt_file="$1"
  local slug; slug="$(basename "$prompt_file" .prompt.md)"
  local task_dir="$DONE/$slug"
  mkdir -p "$task_dir"

  # Precondition: working tree must be clean. Otherwise we'd sweep unrelated
  # changes into the agent's commit.
  if ! tree_is_clean; then
    log "⏸ skipping $slug — working tree is dirty. Commit/stash and retry."
    git -C "$REPO_ROOT" status --porcelain -- ':!.cursor-queue' | head -20 | tee -a "$LOG"
    mv "$prompt_file" "$task_dir/prompt.md.skipped"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$task_dir/.skipped"
    return 64
  fi

  log "▶ start: $slug"
  cp "$prompt_file" "$task_dir/prompt.md"

  local started_at; started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "$started_at" > "$task_dir/.started"

  # Capture both human-readable transcript (stream-json) and a final-result JSON.
  # Use plain command + $? capture (not `if ! cmd`, which clobbers $?).
  set +e
  "$AGENT_BIN" -p \
      --output-format stream-json \
      < "$prompt_file" \
      > "$task_dir/stream.ndjson" \
      2> "$task_dir/stderr.txt"
  local exit_code=$?
  set -e

  if [[ $exit_code -ne 0 ]]; then
    log "✗ $AGENT_BIN exited $exit_code for $slug"
    if [[ -s "$task_dir/stderr.txt" ]]; then
      log "  stderr: $(head -1 "$task_dir/stderr.txt")"
    fi
  fi

  # Even on exit 0, treat empty/auth-error output as failure for commit purposes.
  if [[ ! -s "$task_dir/stream.ndjson" ]] && [[ -s "$task_dir/stderr.txt" ]]; then
    log "✗ $AGENT_BIN produced no output (likely auth or config error) for $slug"
    exit_code=65
  fi

  # Extract a plain-text summary from the last "result" event if present.
  if command -v jq >/dev/null 2>&1; then
    jq -rs '
      [.[] | select(.type=="result" or .type=="assistant_message" or .type=="text")] as $r
      | if ($r|length) > 0 then ($r[-1] | .content // .text // (.|tostring))
        else "(no result events)" end
    ' "$task_dir/stream.ndjson" > "$task_dir/result.md" 2>/dev/null \
      || cp "$task_dir/stream.ndjson" "$task_dir/result.md"
  else
    cp "$task_dir/stream.ndjson" "$task_dir/result.md"
  fi

  # Only commit if the agent actually succeeded.
  if [[ $exit_code -eq 0 ]]; then
    if git -C "$REPO_ROOT" diff --quiet -- ':!.cursor-queue' && \
       git -C "$REPO_ROOT" diff --cached --quiet -- ':!.cursor-queue' && \
       [[ -z "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard -- ':!.cursor-queue')" ]]; then
      log "  no changes from $slug"
    else
      git -C "$REPO_ROOT" add -A ':!.cursor-queue'
      git -C "$REPO_ROOT" commit -m "agent: $slug" --no-verify >/dev/null
      local commit_sha; commit_sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
      log "  committed $commit_sha"
      echo "$commit_sha" > "$task_dir/.commit"
    fi
  else
    log "  skipping commit because $AGENT_BIN failed (exit=$exit_code)"
  fi

  date -u +%Y-%m-%dT%H:%M:%SZ > "$task_dir/.complete"
  echo "$exit_code" > "$task_dir/.exit_code"
  rm -f "$prompt_file"
  if [[ $exit_code -eq 0 ]]; then
    log "✓ done: $slug (exit=0)"
  else
    log "✗ done: $slug (exit=$exit_code)"
  fi
  return $exit_code
}

while true; do
  if [[ -f "$STOP" ]]; then
    log "STOP sentinel found — exiting cleanly."
    exit 0
  fi

  # Process oldest pending prompt, if any.
  next_prompt="$(ls -t "$PENDING"/*.prompt.md 2>/dev/null | tail -1 || true)"
  if [[ -n "$next_prompt" && -f "$next_prompt" ]]; then
    process_one "$next_prompt" || true
    [[ $ONCE -eq 1 ]] && exit 0
  else
    [[ $ONCE -eq 1 ]] && { log "no pending prompts (--once) — exiting."; exit 0; }
    sleep "$POLL_INTERVAL_SEC"
  fi
done
