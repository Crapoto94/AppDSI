#!/usr/bin/env bash
# Met à jour le build web de PdfCraft hébergé dans public/pdfcraft/ (voir docs/PDFCRAFT-INTEGRATION.md).
# Usage : bash scripts/update-pdfcraft.sh [version]   (ex. 0.21.0 ; défaut : dernière release)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=storytold/pdfcraft
if [ $# -ge 1 ]; then VER="${1#v}"; else
  VER=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep -m1 '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/')
fi
echo "PdfCraft version : $VER"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
BASE="https://github.com/$REPO/releases/download/v$VER"
curl -sfL -o "$TMP/web.zip" "$BASE/pdfcraft-web-$VER.zip"
curl -sfL -o "$TMP/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"

EXPECTED=$(grep "pdfcraft-web-$VER.zip" "$TMP/SHA256SUMS.txt" | awk '{print $1}')
ACTUAL=$(sha256sum "$TMP/web.zip" | awk '{print $1}')
[ "$EXPECTED" = "$ACTUAL" ] || { echo "SHA256 invalide ($EXPECTED != $ACTUAL)"; exit 1; }
echo "SHA256 OK"

unzip -oq "$TMP/web.zip" -d "$TMP/x"
SRC=$(find "$TMP/x" -name index.html -maxdepth 2 -exec dirname {} \; | head -1)
rm -rf public/pdfcraft && mkdir -p public/pdfcraft
cp -r "$SRC"/. public/pdfcraft/
rm -f public/pdfcraft/README.md public/pdfcraft/HOSTING.md public/pdfcraft/.htaccess public/pdfcraft/_headers
echo "public/pdfcraft/ mis à jour en $VER. Étape suivante : checklist du §4 de docs/PDFCRAFT-INTEGRATION.md"
