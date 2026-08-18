import { useEffect, useState, type CSSProperties } from 'react'
import { classicTileArtUrl } from '../tiles/classicTileArt'
import {
  LANDING_FIELD_REV,
  LANDING_TILE_ASPECT,
  LANDING_TILE_FIELD,
  type LandingFieldTile,
} from '../tiles/landingTileField'
import '../styles/landing.css'

/** Pixels per tile-width unit when baking the wallpaper. */
const WALLPAPER_TILE_PX = 96

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load tile art: ${url}`))
    img.src = url
  })
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

async function bakeLandingWallpaper(
  tiles: readonly LandingFieldTile[],
  bounds: { w: number; h: number },
): Promise<string> {
  const unit = WALLPAPER_TILE_PX
  const tw = unit
  const th = unit * LANDING_TILE_ASPECT
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(bounds.w * unit))
  canvas.height = Math.max(1, Math.ceil(bounds.h * unit))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')

  const urls = new Set<string>()
  for (const tile of tiles) {
    const src = classicTileArtUrl(tile.def)
    if (src) urls.add(src)
  }
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        images.set(url, await loadImage(url))
      } catch {
        /* skip broken art */
      }
    }),
  )

  const ordered = [...tiles].sort((a, b) => a.z - b.z)
  const radius = tw * 0.132

  for (const tile of ordered) {
    const src = classicTileArtUrl(tile.def)
    const art = src ? images.get(src) : undefined
    const cx = (tile.x + 0.5) * unit
    const cy = (tile.y + LANDING_TILE_ASPECT / 2) * unit

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((tile.rotate * Math.PI) / 180)

    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 2

    roundRectPath(ctx, -tw / 2, -th / 2, tw, th, radius)
    ctx.fillStyle = '#fdfbf7'
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    if (art) {
      ctx.save()
      roundRectPath(ctx, -tw / 2, -th / 2, tw, th, radius)
      ctx.clip()
      ctx.drawImage(art, -tw / 2, -th / 2, tw, th)
      ctx.restore()
    }

    // Light rim so faces read after flatten (matches CSS bevel language lightly).
    roundRectPath(ctx, -tw / 2, -th / 2, tw, th, radius)
    const rim = ctx.createLinearGradient(0, -th / 2, 0, th / 2)
    rim.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
    rim.addColorStop(0.12, 'rgba(255, 255, 255, 0)')
    rim.addColorStop(0.88, 'rgba(0, 0, 0, 0)')
    rim.addColorStop(1, 'rgba(28, 25, 22, 0.28)')
    ctx.fillStyle = rim
    ctx.fill()

    ctx.restore()
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  if (blob) return URL.createObjectURL(blob)
  return canvas.toDataURL('image/png')
}

let wallpaperCachedRev: string | null = null
let wallpaperUrlPromise: Promise<string> | null = null
let wallpaperObjectUrl: string | null = null
/** Resolved URL for sync remounts — avoid blanking the carpet while the promise re-settles. */
let wallpaperResolvedUrl: string | null = null

function getLandingWallpaperUrl(): Promise<string> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Wallpaper bake requires DOM'))
  }
  if (wallpaperUrlPromise && wallpaperCachedRev === LANDING_FIELD_REV) {
    return wallpaperUrlPromise
  }
  if (wallpaperObjectUrl) {
    URL.revokeObjectURL(wallpaperObjectUrl)
    wallpaperObjectUrl = null
  }
  wallpaperResolvedUrl = null
  wallpaperCachedRev = LANDING_FIELD_REV
  wallpaperUrlPromise = bakeLandingWallpaper(
    LANDING_TILE_FIELD.tiles,
    LANDING_TILE_FIELD.bounds,
  )
    .then((url) => {
      wallpaperObjectUrl = url.startsWith('blob:') ? url : null
      wallpaperResolvedUrl = url
      return url
    })
    .catch((err) => {
      wallpaperUrlPromise = null
      wallpaperCachedRev = null
      wallpaperResolvedUrl = null
      throw err
    })
  return wallpaperUrlPromise
}

export function LandingTileAtmosphere({ className }: { className?: string } = {}) {
  const { bounds } = LANDING_TILE_FIELD
  const [wallpaperSrc, setWallpaperSrc] = useState<string | null>(() =>
    wallpaperCachedRev === LANDING_FIELD_REV ? wallpaperResolvedUrl : null,
  )

  useEffect(() => {
    let alive = true
    getLandingWallpaperUrl()
      .then((url) => {
        if (alive) setWallpaperSrc(url)
      })
      .catch(() => {
        /* leave empty — decorative only */
      })
    return () => {
      alive = false
    }
  }, [LANDING_FIELD_REV])

  return (
    <div
      className={['landing__tiles', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-landing-tiles={LANDING_FIELD_REV}
    >
      <div className="landing__tiles-band landing__tiles-band--field">
        <div
          className="landing__tiles-cluster"
          style={
            {
              width: `calc(${bounds.w} * var(--landing-tile-w))`,
              height: `calc(${bounds.h} * var(--landing-tile-w))`,
              '--landing-cluster-units-w': String(bounds.w),
              '--landing-cluster-units-h': String(bounds.h),
            } as CSSProperties
          }
        >
          {wallpaperSrc ? (
            <img
              className="landing__tiles-wallpaper"
              src={wallpaperSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
