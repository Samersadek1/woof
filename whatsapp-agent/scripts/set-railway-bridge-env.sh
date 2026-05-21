#!/usr/bin/env bash
# Run after: npx @railway/cli login && railway link
# Sets bridge env vars on the linked Railway service from local .env
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and set WHATSAPP_BRIDGE_SECRET first."
  exit 1
fi
set -a
source .env
set +a
for key in COMPANY_CHAT_URL WHATSAPP_BRIDGE_SECRET WHATSAPP_BRIDGE_TARGET_SECRET WHATSAPP_BRAND_PHONE; do
  val="${!key:-}"
  if [[ -z "$val" ]]; then
    echo "Skip $key (empty)"
    continue
  fi
  echo "Setting $key on Railway…"
  npx @railway/cli variables set "${key}=${val}"
done
echo "Done. Redeploy the whatsapp-agent service on Railway."
