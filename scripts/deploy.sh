#!/usr/bin/env bash
# Build this client and upload it by FTP.  Run from a deploy/<client> branch:  npm run deploy
#
# deploy.config (committed on the deploy/<client> branch) holds host, user, folder and build settings.
# The FTP password is never committed: put it in deploy.password.local (git-ignored), or type it when asked.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f deploy.config ]; then
  echo "No deploy.config here. Switch to the client's branch first, e.g.  git checkout deploy/pride"
  exit 1
fi
# shellcheck disable=SC1091
source ./deploy.config
: "${FTP_HOST:?FTP_HOST missing in deploy.config}" "${FTP_USER:?FTP_USER missing}" "${FTP_PATH:?FTP_PATH missing}" "${BASE_PATH:?BASE_PATH missing}"

PASS="${FTP_PASS:-}"
if [ -z "$PASS" ] && [ -f deploy.password.local ]; then PASS="$(tr -d '\r\n' < deploy.password.local)"; fi
if [ -z "$PASS" ]; then read -rsp "FTP password for $FTP_USER@$FTP_HOST: " PASS; echo; fi

[ -f .env.local ] || { echo ".env.local (Supabase URL and key) is missing."; exit 1; }
SUPABASE_URL="$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d= -f2-)"

echo "▸ Building for ${BASE_PATH} …"
rm -rf dist
VITE_TENANT_KEY="${TENANT_KEY:-}" VITE_BASE_PATH="$BASE_PATH" npx vite build --logLevel warn
if [ -f dist/api/lead-webhook.php ]; then
  sed -i.bak "s#__SUPABASE_URL__#${SUPABASE_URL}#" dist/api/lead-webhook.php && rm -f dist/api/lead-webhook.php.bak
fi

SSL=()
[ "${FTP_SECURE:-no}" = "yes" ] && SSL=(--ssl-reqd --ftp-ssl-control)
REMOTE="ftp://${FTP_HOST}:${FTP_PORT:-21}/${FTP_PATH#/}"
REMOTE="${REMOTE%/}"

cd dist
# assets first, index.html last: the old page keeps working until the new files are all there
FILES=()
while IFS= read -r f; do FILES+=("$f"); done < <(find . -type f ! -name '.DS_Store' ! -name 'index.html' | sed 's#^\./##' | sort)
FILES+=("index.html")

echo "▸ Uploading ${#FILES[@]} files to ${FTP_HOST}${FTP_PATH} …"
n=0
for f in "${FILES[@]}"; do
  n=$((n + 1))
  printf '  [%d/%d] %s\n' "$n" "${#FILES[@]}" "$f"
  curl -sS --fail --ftp-create-dirs ${SSL[@]+"${SSL[@]}"} --user "${FTP_USER}:${PASS}" -T "$f" "${REMOTE}/${f}"
done
echo "✓ Deployed ${CLIENT_NAME:-client} → ${SITE_URL:-$FTP_HOST}"
