#!/usr/bin/env bash
# Testa a verificação de digital/rosto (WebAuthn) com um autenticador biométrico virtual.
# Requisitos: Node 22+, Playwright com Chromium, e "npm install" feito em web/.
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
cp teste.mjs pagina.html "$TMP"/
cp ../../functions/unlock/core.ts "$TMP"/
ln -s "$(cd ../../../web && pwd)/node_modules" "$TMP/node_modules"
echo '{"type":"module"}' > "$TMP/package.json"
cd "$TMP" && node --experimental-strip-types --no-warnings teste.mjs
