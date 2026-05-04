#!/usr/bin/env python3
"""Build JPEG for iOS Assets.xcassets/Splash.imageset from splash artwork."""
from __future__ import annotations

import io
import os
import sys

from PIL import Image

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from splash_raster_prep import flatten_rgba, prepare_splash_source_rgb  # noqa: E402

# Large enough for a sharp centered logo JPEG at ~2732 px without mushy quantization.
TARGET_BYTES = 3 * 1024 * 1024


def main() -> int:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    default_src = os.path.join(root, "src", "assets", "Splash page - MahjLogic.png")
    src = sys.argv[1] if len(sys.argv) > 1 else default_src

    out_dir = os.path.join(
        root,
        "ios",
        "App",
        "App",
        "Assets.xcassets",
        "Splash.imageset",
    )
    out_jpg = os.path.join(out_dir, "splash-2732x2732.jpg")

    if not os.path.isfile(src):
        print(f"build-ios-splash-image: missing {src}", file=sys.stderr)
        return 1

    if len(sys.argv) > 1:
        img = Image.open(src).convert("RGB")
    else:
        rgb = flatten_rgba(Image.open(src))
        img = prepare_splash_source_rgb(rgb)

    best_data: bytes | None = None
    for q in range(96, 70, -2):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True, subsampling=0)
        data = buf.getvalue()
        if len(data) <= TARGET_BYTES:
            best_data = data
            break
        best_data = data

    assert best_data is not None
    os.makedirs(out_dir, exist_ok=True)
    with open(out_jpg, "wb") as f:
        f.write(best_data)

    for legacy in ("splash-2732x2732.png", "Splash.png"):
        p = os.path.join(out_dir, legacy)
        if os.path.isfile(p):
            os.remove(p)

    print(
        f"build-ios-splash-image: wrote {out_jpg} ({len(best_data)} bytes, {img.size[0]}x{img.size[1]})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
