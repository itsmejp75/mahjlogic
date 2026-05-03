#!/usr/bin/env bash
# Canonical splash source (edit this file only):
#   src/assets/Splash page - MahjLogic.png
# Vector master (optional): src/assets/splash-logo-master.svg — run `npm run splash:from-svg` to rasterize + sync.
# Do not copy splash into dist/ by hand — dist/ is Vite output; public/ is synced from here.
#
# Copies into: public/, iOS Assets.xcassets/Splash.imageset/splash-2732x2732.png, Android res/**/splash.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/assets/Splash page - MahjLogic.png"
if [[ ! -f "$SRC" ]]; then
  echo "sync-splash-native: missing source file: $SRC" >&2
  exit 1
fi

echo "sync-splash-native: copying master to public + building compressed iOS splash JPEG…"
cp "$SRC" "$ROOT/public/Splash page - MahjLogic.png"
python3 "$ROOT/scripts/build-ios-splash-image.py"

echo "sync-splash-native: resizing for Android drawable buckets…"
python3 <<PY
import os, re, subprocess

src = r"$SRC"
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

echo "sync-splash-native: done."
