#!/usr/bin/env bash
# Régénère vendor/firebase/firebase-auth.js (Firebase Auth en un seul fichier local,
# pour ne charger aucun code depuis un site tiers). Nécessite Node 18+.
# Usage : bash scripts/vendor-firebase.sh [version_firebase]
set -euo pipefail
V="${1:-13.4.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
cp "$ROOT/vendor/firebase/entry.js" "$T/entry.js"
cd "$T"
npm init -y >/dev/null
npm install "firebase@$V" esbuild --no-audit --no-fund
npx esbuild entry.js --bundle --format=esm --platform=browser --minify --legal-comments=none --outfile=out.js
cp out.js "$ROOT/vendor/firebase/firebase-auth.js"
node -e "console.log(JSON.stringify({firebase:require('firebase/package.json').version,bundler:'esbuild '+require('esbuild/package.json').version,contenu:'firebase/app + auth (Google) + firestore (mémoire), un seul module ES',regenerer:'voir scripts/vendor-firebase.sh'},null,2))" > "$ROOT/vendor/firebase/VERSIONS.json"
echo "OK : vendor/firebase/firebase-auth.js ($(wc -c < "$ROOT/vendor/firebase/firebase-auth.js") octets)"
