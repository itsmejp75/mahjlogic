import { useEffect, useState, type CSSProperties } from 'react'
import type { TileDef } from '../mahjong/types'
import { classicTileArtUrl } from '../tiles/classicTileArt'
import '../styles/landing.css'

/** Tile aspect matches CSS: height = width * 4/3. Layout units = tile widths. */
const LANDING_TILE_ASPECT = 4 / 3

const LANDING_PEEK_TOP_DEFS: readonly TileDef[] = [
  { cat: 'suit', suit: 'dot', rank: 1 },
  { cat: 'dragon', dragon: 'red' },
  { cat: 'suit', suit: 'bam', rank: 3 },
  { cat: 'wind', wind: 'E' },
  { cat: 'flower', flower: 1 },
  { cat: 'suit', suit: 'crak', rank: 5 },
  { cat: 'joker' },
  { cat: 'suit', suit: 'dot', rank: 8 },
  { cat: 'dragon', dragon: 'green' },
  { cat: 'suit', suit: 'bam', rank: 6 },
  { cat: 'wind', wind: 'N' },
  { cat: 'suit', suit: 'crak', rank: 2 },
  { cat: 'flower', flower: 5 },
  { cat: 'suit', suit: 'dot', rank: 4 },
  { cat: 'dragon', dragon: 'soap' },
  { cat: 'suit', suit: 'bam', rank: 9 },
  { cat: 'wind', wind: 'W' },
  { cat: 'suit', suit: 'crak', rank: 7 },
  { cat: 'suit', suit: 'bam', rank: 1 },
  { cat: 'flower', flower: 7 },
  { cat: 'suit', suit: 'dot', rank: 6 },
  { cat: 'suit', suit: 'crak', rank: 3 },
  { cat: 'wind', wind: 'S' },
  { cat: 'suit', suit: 'bam', rank: 4 },
  { cat: 'dragon', dragon: 'red' },
  { cat: 'suit', suit: 'dot', rank: 2 },
  { cat: 'flower', flower: 4 },
  { cat: 'joker' },
  { cat: 'suit', suit: 'crak', rank: 8 },
  { cat: 'suit', suit: 'bam', rank: 7 },
]

const LANDING_PEEK_BOTTOM_DEFS: readonly TileDef[] = [
  { cat: 'suit', suit: 'crak', rank: 9 },
  { cat: 'dragon', dragon: 'soap' },
  { cat: 'suit', suit: 'bam', rank: 8 },
  { cat: 'flower', flower: 8 },
  { cat: 'suit', suit: 'dot', rank: 5 },
  { cat: 'wind', wind: 'S' },
  { cat: 'suit', suit: 'crak', rank: 1 },
  { cat: 'joker' },
  { cat: 'suit', suit: 'bam', rank: 2 },
  { cat: 'dragon', dragon: 'red' },
  { cat: 'suit', suit: 'dot', rank: 3 },
  { cat: 'flower', flower: 3 },
  { cat: 'suit', suit: 'crak', rank: 4 },
  { cat: 'wind', wind: 'E' },
  { cat: 'suit', suit: 'bam', rank: 5 },
  { cat: 'dragon', dragon: 'green' },
  { cat: 'suit', suit: 'dot', rank: 7 },
  { cat: 'flower', flower: 2 },
  { cat: 'suit', suit: 'crak', rank: 6 },
  { cat: 'wind', wind: 'N' },
  { cat: 'suit', suit: 'bam', rank: 3 },
  { cat: 'suit', suit: 'dot', rank: 9 },
  { cat: 'flower', flower: 6 },
  { cat: 'dragon', dragon: 'soap' },
  { cat: 'suit', suit: 'crak', rank: 2 },
  { cat: 'suit', suit: 'bam', rank: 9 },
  { cat: 'joker' },
  { cat: 'wind', wind: 'W' },
  { cat: 'suit', suit: 'dot', rank: 1 },
  { cat: 'flower', flower: 1 },
]

type LandingPeekTile = {
  def: TileDef
  /** Unrotated face top-left, tile-width units. */
  x: number
  y: number
  rotate: number
  /** Paint order for nested overlaps. */
  z: number
}

type LandingAabb = { left: number; top: number; right: number; bottom: number }

function landingMulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function landingTileAabb(rotateDeg: number): { w: number; h: number } {
  const rad = (Math.abs(rotateDeg) * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    w: c + LANDING_TILE_ASPECT * s,
    h: s + LANDING_TILE_ASPECT * c,
  }
}

function landingBoxFor(x: number, y: number, aabb: { w: number; h: number }): LandingAabb {
  const padX = (aabb.w - 1) / 2
  const padY = (aabb.h - LANDING_TILE_ASPECT) / 2
  return {
    left: x - padX,
    top: y - padY,
    right: x + 1 + padX,
    bottom: y + LANDING_TILE_ASPECT + padY,
  }
}

function landingRandomRotate(rand: () => number): number {
  // Any direction — tossed pile, not a neat upright rack.
  // Bias away from dead 0° so nothing reads as a sorted row.
  const roll = rand()
  if (roll < 0.2) {
    const sign = rand() < 0.5 ? -1 : 1
    return sign * (12 + rand() * 28)
  }
  if (roll < 0.45) {
    const sign = rand() < 0.5 ? -1 : 1
    return sign * (35 + rand() * 40)
  }
  if (roll < 0.7) {
    const sign = rand() < 0.5 ? -1 : 1
    return sign * (70 + rand() * 45)
  }
  // Full spin — sideways / upside-ish faces welcome.
  return rand() * 360 - 180
}

type LandingVec = { x: number; y: number }

/** Corners of the real tile face (not its AABB), center + rotation. */
function landingTileCorners(cx: number, cy: number, rotateDeg: number): LandingVec[] {
  const rad = (rotateDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const hw = 0.5
  const hh = LANDING_TILE_ASPECT / 2
  return [
    { x: cx + (-hw) * c - (-hh) * s, y: cy + (-hw) * s + (-hh) * c },
    { x: cx + hw * c - (-hh) * s, y: cy + hw * s + (-hh) * c },
    { x: cx + hw * c - hh * s, y: cy + hw * s + hh * c },
    { x: cx + (-hw) * c - hh * s, y: cy + (-hw) * s + hh * c },
  ]
}

/** SAT: true if two oriented tile faces overlap (touching edges OK). */
function landingFacesOverlap(
  a: readonly LandingVec[],
  b: readonly LandingVec[],
  epsilon = 0.006,
): boolean {
  const polys = [a, b]
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const p1 = poly[i]!
      const p2 = poly[(i + 1) % poly.length]!
      const axisX = -(p2.y - p1.y)
      const axisY = p2.x - p1.x
      const len = Math.hypot(axisX, axisY) || 1
      const nx = axisX / len
      const ny = axisY / len
      let minA = Infinity
      let maxA = -Infinity
      for (const p of a) {
        const proj = p.x * nx + p.y * ny
        minA = Math.min(minA, proj)
        maxA = Math.max(maxA, proj)
      }
      let minB = Infinity
      let maxB = -Infinity
      for (const p of b) {
        const proj = p.x * nx + p.y * ny
        minB = Math.min(minB, proj)
        maxB = Math.max(maxB, proj)
      }
      if (maxA <= minB + epsilon || maxB <= minA + epsilon) return false
    }
  }
  return true
}

/**
 * Tossed wood-pile carpet — NO lattice / rows.
 * Blob-grow with wild angles, then kiss gaps shut.
 * HARD RULE: faces may touch; faces must NEVER overlap.
 */
function buildLandingTileField(
  seed: number,
  defs: readonly TileDef[],
): { tiles: readonly LandingPeekTile[]; bounds: { w: number; h: number } } {
  const rand = landingMulberry32(seed)
  const pool = [...defs, ...defs, ...defs, ...defs]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }

  type Body = {
    def: TileDef
    rotate: number
    cx: number
    cy: number
    corners: LandingVec[]
    z: number
  }

  const FIELD_W = 11
  const FIELD_H = 8
  const CELL = 1.2
  /** Tiny positive = float tolerance. Touching OK; any real overlap = collide. */
  const CLEAR = 0.004

  const bodies: Body[] = []
  let poolIndex = 0
  const nextDef = (): TileDef => {
    const def = pool[poolIndex % pool.length]!
    poolIndex += 1
    return def
  }

  const PAD_X = 0.65
  const PAD_Y = 0.8
  const COUNT = 70
  const grid = new Map<string, number[]>()

  const clampPos = (cx: number, cy: number): { cx: number; cy: number } => ({
    cx: Math.min(FIELD_W - PAD_X, Math.max(PAD_X, cx)),
    cy: Math.min(FIELD_H - PAD_Y, Math.max(PAD_Y, cy)),
  })

  const inField = (cx: number, cy: number): boolean =>
    cx >= PAD_X && cy >= PAD_Y && cx <= FIELD_W - PAD_X && cy <= FIELD_H - PAD_Y

  const rebuildGrid = (): void => {
    grid.clear()
    for (let i = 0; i < bodies.length; i += 1) insert(i, bodies[i]!.cx, bodies[i]!.cy)
  }

  const insert = (index: number, cx: number, cy: number): void => {
    const k = `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)}`
    const bucket = grid.get(k)
    if (bucket) bucket.push(index)
    else grid.set(k, [index])
  }

  const nearbyIndices = (cx: number, cy: number): number[] => {
    const gx = Math.floor(cx / CELL)
    const gy = Math.floor(cy / CELL)
    const out: number[] = []
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const bucket = grid.get(`${gx + dx},${gy + dy}`)
        if (bucket) out.push(...bucket)
      }
    }
    return out
  }

  const collidesExcept = (
    corners: LandingVec[],
    cx: number,
    cy: number,
    except: number,
  ): boolean => {
    for (const idx of nearbyIndices(cx, cy)) {
      if (idx === except) continue
      if (landingFacesOverlap(corners, bodies[idx]!.corners, CLEAR)) return true
    }
    return false
  }

  const place = (cx: number, cy: number, rotate: number): void => {
    const index = bodies.length
    bodies.push({
      def: nextDef(),
      rotate,
      cx,
      cy,
      corners: landingTileCorners(cx, cy, rotate),
      z: index,
    })
    insert(index, cx, cy)
  }

  // One nucleus — grow a tossed blob outward (no lattice).
  place(
    FIELD_W * (0.4 + rand() * 0.2),
    FIELD_H * (0.38 + rand() * 0.24),
    landingRandomRotate(rand),
  )

  /**
   * Attach on a random bearing: binary-search the closest SAT-clear distance
   * so faces kiss without ever overlapping.
   */
  let attempts = 0
  const maxAttempts = COUNT * 500
  while (bodies.length < COUNT && attempts < maxAttempts) {
    attempts += 1
    const anchor = bodies[Math.floor(rand() * bodies.length)]!
    const bearing = rand() * Math.PI * 2
    const ux = Math.cos(bearing)
    const uy = Math.sin(bearing)
    const rotate = landingRandomRotate(rand)
    let lo = 0.9
    let hi = 1.85
    let best: { cx: number; cy: number } | null = null
    // Far end must clear — if not, try another bearing.
    {
      const far = clampPos(anchor.cx + ux * hi, anchor.cy + uy * hi)
      if (!inField(far.cx, far.cy)) continue
      if (collidesExcept(landingTileCorners(far.cx, far.cy, rotate), far.cx, far.cy, -1)) continue
      best = far
    }
    for (let k = 0; k < 14; k += 1) {
      const mid = (lo + hi) / 2
      const next = clampPos(anchor.cx + ux * mid, anchor.cy + uy * mid)
      if (!inField(next.cx, next.cy)) {
        lo = mid
        continue
      }
      const corners = landingTileCorners(next.cx, next.cy, rotate)
      if (collidesExcept(corners, next.cx, next.cy, -1)) lo = mid
      else {
        best = next
        hi = mid
      }
    }
    if (!best) continue
    // Tiny lateral stagger so attachments don’t ring the anchor.
    const slip = clampPos(best.cx + (rand() - 0.5) * 0.12, best.cy + (rand() - 0.5) * 0.12)
    if (
      inField(slip.cx, slip.cy) &&
      !collidesExcept(landingTileCorners(slip.cx, slip.cy, rotate), slip.cx, slip.cy, -1)
    ) {
      place(slip.cx, slip.cy, rotate)
    } else {
      place(best.cx, best.cy, rotate)
    }
  }

  /** Pull toward a point only while faces stay non-overlapping. */
  const pullToward = (i: number, tx: number, ty: number, reach: number): void => {
    const a = bodies[i]!
    const dx = tx - a.cx
    const dy = ty - a.cy
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-4) return
    const ux = dx / dist
    const uy = dy / dist
    let lo = 0
    let hi = Math.min(reach, dist)
    let bestCx = a.cx
    let bestCy = a.cy
    for (let k = 0; k < 16; k += 1) {
      const mid = (lo + hi) / 2
      const cx = a.cx + ux * mid
      const cy = a.cy + uy * mid
      if (!inField(cx, cy)) {
        hi = mid
        continue
      }
      const corners = landingTileCorners(cx, cy, a.rotate)
      if (collidesExcept(corners, cx, cy, i)) hi = mid
      else {
        bestCx = cx
        bestCy = cy
        lo = mid
      }
    }
    if (lo > 1e-5) {
      a.cx = bestCx
      a.cy = bestCy
      a.corners = landingTileCorners(a.cx, a.cy, a.rotate)
    }
  }

  /** If anything still overlaps, shove it apart until clear. */
  const separateOverlaps = (): void => {
    for (let pass = 0; pass < 24; pass += 1) {
      let moved = false
      for (let i = 0; i < bodies.length; i += 1) {
        const a = bodies[i]!
        for (const j of nearbyIndices(a.cx, a.cy)) {
          if (j <= i) continue
          const b = bodies[j]!
          if (!landingFacesOverlap(a.corners, b.corners, CLEAR)) continue
          const dx = a.cx - b.cx
          const dy = a.cy - b.cy
          const dist = Math.hypot(dx, dy) || 1e-4
          const ux = dx / dist
          const uy = dy / dist
          // Step apart until both positions are SAT-clear (or step budget dies).
          for (let step = 0; step < 18; step += 1) {
            const na = clampPos(a.cx + ux * 0.04, a.cy + uy * 0.04)
            const nb = clampPos(b.cx - ux * 0.04, b.cy - uy * 0.04)
            a.cx = na.cx
            a.cy = na.cy
            b.cx = nb.cx
            b.cy = nb.cy
            a.corners = landingTileCorners(a.cx, a.cy, a.rotate)
            b.corners = landingTileCorners(b.cx, b.cy, b.rotate)
            moved = true
            if (!landingFacesOverlap(a.corners, b.corners, CLEAR)) break
          }
        }
      }
      rebuildGrid()
      if (!moved) break
    }
  }

  separateOverlaps()

  // Kiss gaps shut — never past touching.
  for (let pass = 0; pass < 22; pass += 1) {
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!
      const neighbors: { j: number; d: number }[] = []
      for (const j of nearbyIndices(a.cx, a.cy)) {
        if (j === i) continue
        const b = bodies[j]!
        neighbors.push({ j, d: Math.hypot(b.cx - a.cx, b.cy - a.cy) })
      }
      neighbors.sort((p, q) => p.d - q.d)
      for (const n of neighbors.slice(0, 3)) {
        if (n.d < 0.95) continue
        const b = bodies[n.j]!
        pullToward(i, b.cx, b.cy, n.d * 0.45)
      }
    }
    rebuildGrid()
  }

  separateOverlaps()

  {
    const byY = bodies
      .map((b, i) => ({ i, key: b.cy + b.cx * 0.15 + rand() * 0.12 }))
      .sort((a, b) => a.key - b.key)
    for (let rank = 0; rank < byY.length; rank += 1) {
      bodies[byY[rank]!.i]!.z = rank
    }
  }

  const raw = bodies.map((b) => ({
    def: b.def,
    x: b.cx - 0.5,
    y: b.cy - LANDING_TILE_ASPECT / 2,
    rotate: Math.round(b.rotate * 10) / 10,
    z: b.z,
  }))

  let minL = Infinity
  let minT = Infinity
  for (const t of raw) {
    const box = landingBoxFor(t.x, t.y, landingTileAabb(t.rotate))
    minL = Math.min(minL, box.left)
    minT = Math.min(minT, box.top)
  }

  const shiftX = -minL + 0.02
  const shiftY = -minT + 0.02

  const tiles = raw.map((t) => ({
    def: t.def,
    x: t.x + shiftX,
    y: t.y + shiftY,
    rotate: t.rotate,
    z: t.z,
  }))

  let outMaxR = 0
  let outMaxB = 0
  for (const t of tiles) {
    const box = landingBoxFor(t.x, t.y, landingTileAabb(t.rotate))
    outMaxR = Math.max(outMaxR, box.right)
    outMaxB = Math.max(outMaxB, box.bottom)
  }

  const bounds = {
    w: outMaxR + 0.04,
    h: outMaxB + 0.04,
  }

  // Swap the 3 Crak nearest center for a joker (readable in menu/lobby dump).
  {
    const logoCx = bounds.w / 2
    const logoCy = bounds.h / 2
    let bestIdx = -1
    let bestD = Infinity
    for (let i = 0; i < tiles.length; i += 1) {
      const t = tiles[i]!
      if (t.def.cat !== 'suit' || t.def.suit !== 'crak' || t.def.rank !== 3) continue
      const tcx = t.x + 0.5
      const tcy = t.y + LANDING_TILE_ASPECT / 2
      const d = (tcx - logoCx) ** 2 + (tcy - logoCy) ** 2
      if (d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      const t = tiles[bestIdx]!
      // Pure 180° keeps the same rectangular footprint — no overlap introduced.
      tiles[bestIdx] = {
        ...t,
        def: { cat: 'joker' },
        rotate: Math.round((t.rotate + 180) * 10) / 10,
      }
    }
  }

  // Zoom to the actual dump, not a padded empty field.
  return { tiles, bounds }
}

const LANDING_FIELD_DEFS: readonly TileDef[] = [
  ...LANDING_PEEK_TOP_DEFS,
  ...LANDING_PEEK_BOTTOM_DEFS,
]
const LANDING_FIELD_REV = 'table-dump-wallpaper-v5-joker-180'
const LANDING_TILE_FIELD = buildLandingTileField(0xb8e2c41d, LANDING_FIELD_DEFS)

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
  tiles: readonly LandingPeekTile[],
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
