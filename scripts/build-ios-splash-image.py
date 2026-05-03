#!/usr/bin/env python3
"""Build a memory-friendly splash JPEG for iOS Assets.xcassets from the master PNG."""
from __future__ import annotations

import io
import os
import sys

from PIL import Image

# Max side keeps decoded bitmap smaller for the asset compiler (2732² is heavy).
MAX_SIDE = 2048
TARGET_BYTES = 500 * 1024


def main() -> int:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    src = os.path.join(root, "src", "assets", "Splash page - MahjLogic.png")
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

    img = Image.open(src).convert("RGBA")
    bg = Image.new("RGB", img.size, (26, 26, 26))
    bg.paste(img, mask=img.split()[3])
    img = bg

    w, h = img.size
    if max(w, h) > MAX_SIDE:
        img = img.resize((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)

    best_data: bytes | None = None
    for q in range(95, 39, -3):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True, subsampling=1)
        data = buf.getvalue()
        if len(data) <= TARGET_BYTES:
            best_data = data
            break
        best_data = data

    assert best_data is not None
    os.makedirs(out_dir, exist_ok=True)
    with open(out_jpg, "wb") as f:
        f.write(best_data)

    # Drop legacy PNG slot file if present
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
