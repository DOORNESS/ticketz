#!/usr/bin/env bash
set -euo pipefail

# Deploy local — mesmo fluxo do GitHub Actions (Nível Cashback / WebG3).
# Requer: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
CF_PROJECT="${CF_PROJECT_NAME:-fortmax-ticketz-prod}"
CF_BRANCH="${CF_BRANCH:-main}"

: "${CLOUDFLARE_API_TOKEN:?Defina CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Defina CLOUDFLARE_ACCOUNT_ID}"

echo "==> Build frontend"
cd "$FRONTEND"
NODE_OPTIONS=--openssl-legacy-provider npm run build
cp public/config-prod.json build/config.json

echo "==> Deploy Cloudflare Pages ($CF_PROJECT)"
cd "$ROOT"
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
npx wrangler pages deploy frontend/build \
  --project-name="$CF_PROJECT" \
  --branch="$CF_BRANCH" \
  --commit-dirty=true

if [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "==> Purge cache zona fortmax.com.br"
  curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"purge_everything":true}'
  echo
fi

echo "==> Publicado: https://suporte.fortmax.com.br"
