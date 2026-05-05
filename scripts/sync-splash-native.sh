#!/usr/bin/env bash
# Canonical splash master (PNG), rasterized from `src/assets/mahjlogic-watermark.svg`:
#   node scripts/rasterize-splash-from-svg.mjs && bash scripts/sync-splash-native.sh
#
# Pipeline writes a sharpened/intermediate raster (normalized min longest side ~2732px) to
# `.splash-prepared.png` — then mirrors that to public + iOS + Android so low-res PNG artwork
# is not blurry when scaled onto device splash pixels.
#
# Outputs: public/Splash page - MahjLogic.png, Splash.imageset JPEG, Android res/**/splash.png,
#          public/startup/apple-splash-*.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/assets/Splash page - MahjLogic.png"
PREPARED="$ROOT/.splash-prepared.png"
if [[ ! -f "$SRC" ]]; then
  echo "sync-splash-native: missing source file: $SRC" >&2
  exit 1
fi

echo "sync-splash-native: normalizing resolution (splash_raster_prep)…"
python3 "$ROOT/scripts/stage-prepared-splash.py" "$SRC" "$PREPARED"

echo "sync-splash-native: syncing prepared PNG → public…"
cp "$PREPARED" "$ROOT/public/Splash page - MahjLogic.png"

echo "sync-splash-native: building compressed iOS splash JPEG…"
python3 "$ROOT/scripts/build-ios-splash-image.py" "$PREPARED"

echo "sync-splash-native: resizing for Android drawable buckets…"
python3 <<PY
import os, re, subprocess

src = r"$PREPARED"
root = os.path.join(r"$ROOT", "android", "app", "src", "main", "res")
for dirpath, _, files in os.walk(root):
    if "splash.png" not in files:
        continue
    dest = os.path.join(dirpath, "splash.png")
    out = subprocess.check_output(["sips", "-g", "pixelWidth", "-g", "pixelHeight", dest], text=True)
    w = int(re.search(r"pixelWidth:\\s*(\\d+)", out).group(1))
    h = int(re.search(r"pixelHeight:\\s*(\\d+)", out).group(1))
    subprocess.check_call(
        ["sips", "-z", str(h), str(w), src, "--out", dest],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(" ", dest, "->", w, "x", h)
PY

echo "sync-splash-native: PWA iOS startup PNGs…"
python3 "$ROOT/scripts/regenerate-pwa-startup-images.py" "$PREPARED"

echo "sync-splash-native: done."
