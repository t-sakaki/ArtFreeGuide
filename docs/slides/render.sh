#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLIDES="$ROOT/docs/slides"
OUT="$ROOT/docs/images/slides"
RAW="$OUT/.raw"
mkdir -p "$OUT"
mkdir -p "$RAW"
trap 'rm -rf "$RAW"' EXIT

declare -a names=(title problem product loop multilingual architecture numbers closing)
for i in "${!names[@]}"; do
  n=$(printf '%02d' "$((i + 1))")
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=1920,1167 --screenshot="$RAW/${n}-${names[$i]}.png" \
    "file://$SLIDES/${n}-${names[$i]}.html"
  python3 - "$RAW/${n}-${names[$i]}.png" "$OUT/${n}-${names[$i]}.png" <<'PY'
from PIL import Image
import sys
Image.open(sys.argv[1]).crop((0, 0, 1920, 1080)).save(sys.argv[2], optimize=True)
PY
done

if command -v pngquant >/dev/null 2>&1; then
  pngquant --quality 80-95 --strip --force --ext .png "$OUT"/*.png
elif command -v oxipng >/dev/null 2>&1; then
  oxipng -o 4 --strip safe "$OUT"/*.png
elif command -v optipng >/dev/null 2>&1; then
  optipng -o 3 "$OUT"/*.png
else
  echo "warning: no lossless PNG optimizer or pngquant is installed; keeping truecolor PNGs" >&2
fi
