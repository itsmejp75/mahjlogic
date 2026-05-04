#!/usr/bin/env python3
"""Read master splash PNG, normalize resolution, write prepared PNG for native + PWA."""
from __future__ import annotations

import os
import sys

from PIL import Image

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from splash_raster_prep import flatten_rgba, prepare_splash_source_rgb  # noqa: E402


def main() -> int:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        root, "src", "assets", "Splash page - MahjLogic.png"
    )
    dest = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, ".splash-prepared.png")

    if not os.path.isfile(src):
        print(f"stage-prepared-splash: missing {src}", file=sys.stderr)
        return 1

    rgb = flatten_rgba(Image.open(src))
    rgb = prepare_splash_source_rgb(rgb)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    rgb.save(dest, optimize=True)
    print(f"stage-prepared-splash: wrote {dest} ({rgb.size[0]}×{rgb.size[1]} RGB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
