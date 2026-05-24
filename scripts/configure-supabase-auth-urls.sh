#!/usr/bin/env bash
# Updates woof Supabase Auth URL config so invite emails redirect to production.
#
# Requires SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens).
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_..."
#   ./scripts/configure-supabase-auth-urls.sh
# Optional override:
#   APP_BASE_URL=https://your-domain.com ./scripts/configure-supabase-auth-urls.sh

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-wineliuwejkxwsdbrthb}"
SITE_URL="${APP_BASE_URL:-https://woof-neon.vercel.app}"
SITE_URL="${SITE_URL%/}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "error: set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

# Comma-separated allow list (Supabase Management API).
URI_ALLOW_LIST="${URI_ALLOW_LIST:-${SITE_URL}/**,${SITE_URL}/auth/setup-password,https://woof-drool1.vercel.app/**,https://woof-git-main-drool1.vercel.app/**,https://*-drool1.vercel.app/**,http://localhost:8080/**}"

echo "Setting site_url=${SITE_URL}"
echo "Allow list: ${URI_ALLOW_LIST}"

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg site_url "$SITE_URL" \
    --arg uri_allow_list "$URI_ALLOW_LIST" \
    '{ site_url: $site_url, uri_allow_list: $uri_allow_list }')" \
  | jq '{ site_url, uri_allow_list }'

echo "Done. Re-send a staff invite and confirm redirect_to uses ${SITE_URL}."
