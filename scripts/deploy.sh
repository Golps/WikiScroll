#!/bin/bash
# Deploy only the wikiscroll Worker using environment credentials.
# Optional local profiles may supply credentials from outside this repository.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f ../private/tool-config/deploy-env.sh ]; then
  profile="${1:-default}"
  . ../private/tool-config/deploy-env.sh "$profile"
  if [ "$#" -gt 0 ]; then shift; fi
fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WRANGLER_SEND_METRICS=false
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$PWD/.wrangler/config}"
mkdir -p "$XDG_CONFIG_HOME"
node_bin="$(command -v node || true)"
[ -n "$node_bin" ] || { echo 'Node.js must be on PATH.' >&2; exit 1; }
started_at="$($node_bin -e 'console.log(new Date().toISOString())')"
set +e
if [ -n "${WRANGLER_BIN:-}" ]; then
  output="$("$WRANGLER_BIN" deploy "$@" 2>&1)"; status=$?
else
  output="$("$node_bin" node_modules/wrangler/bin/wrangler.js deploy "$@" 2>&1)"; status=$?
fi
set -e
printf '%s\n' "$output"
rm -rf .wrangler/tmp
if [ "$status" -ne 0 ]; then
  if ! grep -q 'Uploaded wikiscroll' <<<"$output" || ! grep -q '/workers/subdomain' <<<"$output" || ! grep -q '10000' <<<"$output"; then
    exit "$status"
  fi
  echo 'Worker upload completed; verifying deployment after the restricted workers.dev check.'
fi
"$node_bin" scripts/verify-deployment.mjs "$started_at"
