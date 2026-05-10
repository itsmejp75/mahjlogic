#!/usr/bin/env python3
"""Build public/startup/apple-splash-{w}x{h}.png from a prepared splash RGB master."""
from __future__ import annotations

import os
import sys

from PIL import Image

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from splash_raster_prep import (  # noqa: E402
    SPLASH_BG_RGB,
    flatten_rgba,
    prepare_splash_source_rgb,
)

SIZES = {
    (2556, 1179),
    (1179, 2556),
    (2796, 1290),
    (1290, 2796),
    (2778, 1284),
    (1284, 2778),
    (2532, 1170),
    (1170, 2532),
    (2436, 1125),
    (1125, 2436),
    (2340, 1080),
    (1080, 2340),
    (1792, 828),
    (828, 1792),
    (2688, 1242),
    (1242, 2688),
    (2208, 1242),
    (1242, 2208),
    (1334, 750),
    (750, 1334),
}


def main() -> int:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if len(sys.argv) > 1:
        prepared = sys.argv[1]
        img = Image.open(prepared).convert("RGB")
    else:
        src = os.path.join(root, "src", "assets", "Splash page - MahjLogic.png")
        if not os.path.isfile(src):
            print("regenerate-pwa-startup-images: missing", src, file=sys.stderr)
            return 1
        img = flatten_rgba(Image.open(src), bg_rgb=SPLASH_BG_RGB)
        img = prepare_splash_source_rgb(img)

    out_dir = os.path.join(root, "public", "startup")
    os.makedirs(out_dir, exist_ok=True)
    bg = (*SPLASH_BG_RGB, 255)
    iw, ih = img.size

    for w, h in sorted(SIZES):
        canvas = Image.new("RGBA", (w, h), bg)
        scale = min(w / iw, h / ih)
        tw = max(1, round(iw * scale))
        th = max(1, round(ih * scale))
        resized = img.resize((tw, th), Image.Resampling.LANCZOS)
        pos = ((w - tw) // 2, (h - th) // 2)
        canvas.paste(resized, pos)
        path = os.path.join(out_dir, f"apple-splash-{w}x{h}.png")
        canvas.convert("RGB").save(path, optimize=True)

    print("regenerate-pwa-startup-images: wrote", len(SIZES), "PNG(s) →", out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
