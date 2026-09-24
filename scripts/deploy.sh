#!/bin/bash
# Deploy the WikiScroll Worker with a Worker-scoped Cloudflare API token.
#
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bash scripts/deploy.sh
#
# Values can also come from a local .env file (see .env.example), which is
# git-ignored. The token needs only Workers Scripts edit access to this one
# Worker; see docs/DEVELOPMENT.md. No stored `wrangler login` is used, so a
# deploy cannot reach any other Worker, domain or account setting.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (see .env.example)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID (see .env.example)}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WRANGLER_SEND_METRICS=false
# Keep Wrangler's config and logs inside the project, away from any global login.
export XDG_CONFIG_HOME="$PWD/.wrangler/config"
mkdir -p "$XDG_CONFIG_HOME"

node_bin="$(command -v node)"
wrangler="${WRANGLER_BIN:-$node_bin node_modules/wrangler/bin/wrangler.js}"

set +e
output="$($wrangler deploy "$@" 2>&1)"; status=$?
set -e
printf '%s\n' "$output"
# Wrangler leaves a bundle copy per deploy in .wrangler/tmp.
rm -rf .wrangler/tmp

# A Worker-only token cannot read the account-wide workers.dev setting, so
# Wrangler reports code 10000 on /workers/subdomain AFTER the upload. The new
# version is already live; report it instead of failing.
if [ "$status" -ne 0 ] && grep -q "Uploaded wikiscroll" <<<"$output" && grep -q "/workers/subdomain" <<<"$output"; then
  latest="$(curl -s -m 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/wikiscroll/deployments" |
    "$node_bin" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s).result.deployments[0];console.log(d.versions.map(v=>v.version_id+" ("+v.percentage+"%)").join(", "),"deployed",d.created_on)}catch{console.log("unknown")}})')"
  echo
  echo "Deployed. Live version: $latest"
  echo "(The workers.dev check above needs account-wide access; failing it is expected with a Worker-scoped token.)"
  exit 0
fi
exit "$status"
