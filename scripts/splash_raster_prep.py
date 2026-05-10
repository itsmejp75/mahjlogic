"""Shared splash raster normalization — upscale small masters before device scaling blurs logos."""
from __future__ import annotations

from PIL import Image

"""Minimum longest side before platform-specific resizing (covers iPhone splash ~3× logical)."""
SRC_MIN_SIDE = 2732
"""Avoid accidentally shipping multi‑8K raster in the repo from huge exports."""
SRC_MAX_SIDE = 4096

# Match `app.json` / Capacitor splash background.
SPLASH_BG_RGB: tuple[int, int, int] = (18, 20, 25)  # #121419

"""Logo max edge as fraction of square canvas side (rest is margin). ~0.46 reads “app splash”, not billboard."""
SPLASH_LOGO_MAX_EDGE_FRAC = 0.46


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


def _square_padded_canvas(im: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    w, h = im.size
    side = max(w, h)
    if w == h == side:
        return im
    canvas = Image.new("RGB", (side, side), bg)
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


def _embed_logo_centered(
    im: Image.Image,
    *,
    canvas_side: int,
    logo_max_edge_frac: float,
    bg: tuple[int, int, int],
) -> Image.Image:
    """Scale `im` (square) so max edge ≤ canvas_side * frac; center on canvas_side²."""
    w, h = im.size
    if w != h:
        raise ValueError("_embed_logo_centered expects a square source")
    target = max(1, round(canvas_side * logo_max_edge_frac))
    if max(w, h) <= target:
        small = im
    else:
        scale = target / max(w, h)
        nw = max(1, round(w * scale))
        nh = max(1, round(h * scale))
        small = im.resize((nw, nh), Image.Resampling.LANCZOS)
    sw, sh = small.size
    canvas = Image.new("RGB", (canvas_side, canvas_side), bg)
    canvas.paste(small, ((canvas_side - sw) // 2, (canvas_side - sh) // 2))
    return canvas


def prepare_splash_source_rgb(im_rgb: Image.Image) -> Image.Image:
    """Return an RGB raster suitable as the single canonical splash intermediate."""
    if im_rgb.mode != "RGB":
        raise ValueError("prepare_splash_source_rgb expects RGB (call flatten_rgba first)")
    img = ensure_longest_side_at_least(im_rgb, SRC_MIN_SIDE)
    img = ensure_longest_side_at_most(img, SRC_MAX_SIDE)
    img = _square_padded_canvas(img, SPLASH_BG_RGB)
    side = max(img.size)
    if side != SRC_MIN_SIDE:
        img = img.resize((SRC_MIN_SIDE, SRC_MIN_SIDE), Image.Resampling.LANCZOS)
    img = _embed_logo_centered(
        img,
        canvas_side=SRC_MIN_SIDE,
        logo_max_edge_frac=SPLASH_LOGO_MAX_EDGE_FRAC,
        bg=SPLASH_BG_RGB,
    )
    return img
