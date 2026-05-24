#!/usr/bin/env bash
# open-in-cursor.sh — hand a file, folder, or diff from a terminal / Cowork chat
# into Cursor. Requires the `cursor` CLI to be on PATH
# (Cursor → Cmd+Shift+P → "Shell Command: Install 'cursor' command").

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<EOF
Usage:
  scripts/open-in-cursor.sh                       # open the whole woof repo
  scripts/open-in-cursor.sh PATH [PATH ...]       # open one or more files/folders
  scripts/open-in-cursor.sh --diff                # open all files in the current git diff vs main
  scripts/open-in-cursor.sh --staged              # open all staged files
  scripts/open-in-cursor.sh --branch              # open all files changed on this branch vs main
  scripts/open-in-cursor.sh --line FILE:LINE      # open FILE at LINE (column 1)
  scripts/open-in-cursor.sh --prompt FILE         # open FILE in Cursor AND copy stdin to clipboard
                                                  #   so you can paste into Cursor agent (⌘L → ⌘V → Enter)

Examples:
  scripts/open-in-cursor.sh src/hooks/useBilling.ts
  scripts/open-in-cursor.sh src/pages src/hooks
  scripts/open-in-cursor.sh --line src/pages/Boarding.tsx:142
  scripts/open-in-cursor.sh --diff
  echo "Add a refund button to CheckoutSheet..." | scripts/open-in-cursor.sh --prompt src/components/CheckoutSheet.tsx
EOF
}

if ! command -v cursor >/dev/null 2>&1; then
  echo "error: 'cursor' command not found on PATH." >&2
  echo "       Open Cursor → Cmd+Shift+P → \"Shell Command: Install 'cursor' command\"." >&2
  exit 127
fi

cd "$REPO_ROOT"

case "${1:-}" in
  ""|"--help"|"-h")
    if [[ "${1:-}" == "" ]]; then
      cursor "$REPO_ROOT"
      exit 0
    fi
    usage; exit 0;;
  "--diff")
    mapfile -t files < <(git diff --name-only main...HEAD; git diff --name-only)
    if [[ ${#files[@]} -eq 0 ]]; then
      echo "no diff vs main and no unstaged changes"; exit 0
    fi
    cursor "$REPO_ROOT" "${files[@]}";;
  "--staged")
    mapfile -t files < <(git diff --name-only --cached)
    [[ ${#files[@]} -eq 0 ]] && { echo "no staged files"; exit 0; }
    cursor "$REPO_ROOT" "${files[@]}";;
  "--branch")
    mapfile -t files < <(git diff --name-only main...HEAD)
    [[ ${#files[@]} -eq 0 ]] && { echo "no changes vs main on this branch"; exit 0; }
    cursor "$REPO_ROOT" "${files[@]}";;
  "--line")
    target="${2:-}"
    [[ -z "$target" ]] && { usage; exit 2; }
    cursor --goto "$REPO_ROOT/$target";;
  "--prompt")
    target="${2:-}"
    [[ -z "$target" ]] && { usage; exit 2; }
    if ! command -v pbcopy >/dev/null 2>&1; then
      echo "error: pbcopy not found (macOS-only feature)" >&2; exit 127
    fi
    # Read stdin to clipboard, then open the file
    pbcopy
    cursor "$REPO_ROOT" "$REPO_ROOT/$target"
    echo "prompt is on the clipboard — in Cursor: ⌘L → ⌘V → Enter";;
  *)
    cursor "$REPO_ROOT" "$@";;
esac
