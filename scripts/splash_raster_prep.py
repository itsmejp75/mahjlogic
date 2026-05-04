"""Shared splash raster normalization — upscale small masters before device scaling blurs logos."""
from __future__ import annotations

from PIL import Image

"""Minimum longest side before platform-specific resizing (covers iPhone splash ~3× logical)."""
SRC_MIN_SIDE = 2732
"""Avoid accidentally shipping multi‑8K raster in the repo from huge exports."""
SRC_MAX_SIDE = 4096


def flatten_rgba(
    image: Image.Image,
    *,
    bg_rgb: tuple[int, int, int] = (0, 0, 0),
) -> Image.Image:
    """Composite RGBA onto a solid background (JPEG / Android bucket inputs)."""
    im = image.convert("RGBA")
    base = Image.new("RGB", im.size, bg_rgb)
    base.paste(im, mask=im.split()[3])
    return base


def _resize_longest_side(im: Image.Image, longest_target: int) -> Image.Image:
    w, h = im.size
    cur = max(w, h)
    if cur == 0:
        return im
    scale = longest_target / cur
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def ensure_longest_side_at_least(im: Image.Image, min_side: int) -> Image.Image:
    if max(im.size) >= min_side:
        return im
    return _resize_longest_side(im, min_side)


def ensure_longest_side_at_most(im: Image.Image, max_side: int) -> Image.Image:
    if max(im.size) <= max_side:
        return im
    return _resize_longest_side(im, max_side)


def prepare_splash_source_rgb(im_rgb: Image.Image) -> Image.Image:
    """Return an RGB raster suitable as the single canonical splash intermediate."""
    if im_rgb.mode != "RGB":
        raise ValueError("prepare_splash_source_rgb expects RGB (call flatten_rgba first)")
    img = ensure_longest_side_at_least(im_rgb, SRC_MIN_SIDE)
    img = ensure_longest_side_at_most(img, SRC_MAX_SIDE)
    return img
