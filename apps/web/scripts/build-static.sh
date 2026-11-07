#!/usr/bin/env bash
# Build the read-only static snapshot of the web app (for hosting on a static file server).
#   VITE_THEME=brand  -> loads src/themes/brand.css (corporate palette) on top of the normal styles.
# Data is NOT produced here: copy the exported JSON files into <out>/data/ afterwards.
# Usage: scripts/build-static.sh <out_dir> [theme]
set -euo pipefail
OUT=${1:?out dir}
THEME=${2:-}
cd "$(dirname "$0")/.."
rm -rf "$OUT"
VITE_STATIC=1 VITE_THEME="$THEME" VITE_SNAPSHOT_AT="${VITE_SNAPSHOT_AT:-$(TZ=Europe/Madrid date '+%d/%m/%Y %H:%M')}" \
  npx vite build --outDir "$OUT" --emptyOutDir
# Opened as ".../folder" (no trailing slash) relative ./assets would resolve one level up: add the slash.
python3 - "$OUT/index.html" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
fix = "<script>if(!location.pathname.endsWith('/')&&!/\\.html$/.test(location.pathname)){location.replace(location.pathname+'/'+location.search+location.hash)}</script>"
assert '<head>' in s
open(p, 'w').write(s.replace('<head>', '<head>' + fix, 1))
EOF
echo "static build ready in $OUT"
