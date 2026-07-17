import type { TileDef } from '../mahjong/types'

const classicTileModules = import.meta.glob<string>('../assets/tiles/classic/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

function stemFromPath(path: string): string {
  const match = path.match(/\/([^/]+)\.svg$/)
  return match?.[1] ?? ''
}

const classicTileUrlByStem = new Map<string, string>()
for (const [path, url] of Object.entries(classicTileModules)) {
  classicTileUrlByStem.set(stemFromPath(path), url)
}

const WIND_STEM: Record<'E' | 'S' | 'W' | 'N', string> = {
  E: 'wind_east',
  S: 'wind_south',
  W: 'wind_west',
  N: 'wind_north',
}

/** Every distinct Illustrative Classic tile-art URL (deduped across stems). */
export const ALL_CLASSIC_TILE_ART_URLS: readonly string[] = Array.from(
  new Set(classicTileUrlByStem.values()),
)

/** URLs that have successfully loaded/decoded at least once in this session. */
const classicTileArtReady = new Set<string>()

export function isClassicTileArtReady(url: string): boolean {
  return classicTileArtReady.has(url)
}

export function markClassicTileArtReady(url: string): void {
  classicTileArtReady.add(url)
}

let tileArtPreloadStarted = false

/** Keep mobile Safari’s ~6-connection pool free for JS chunks + the suggested-hands worker. */
const PRELOAD_CONCURRENCY = 2
const PRELOAD_RETRY_LIMIT = 2

type PreloadOptions = {
  /**
   * Native Capacitor splash can afford an immediate warm. Mobile Safari / PWA must wait —
   * flooding ~45 SVGs at module load starves JS chunks and the rank worker (empty Logic panel +
   * broken tile faces).
   */
  immediate?: boolean
}

/**
 * Fetch + decode Illustrative Classic tile SVGs with a small concurrency cap.
 * Called after first paint (web) or during splash (native) so the first rack paint can hit cache
 * without blocking boot.
 */
export function preloadClassicTileArt(options?: PreloadOptions): void {
  if (tileArtPreloadStarted || typeof Image === 'undefined') return
  tileArtPreloadStarted = true

  const run = () => {
    const queue = ALL_CLASSIC_TILE_ART_URLS.map((url) => ({ url, attempts: 0 }))
    let active = 0

    const pump = () => {
      while (active < PRELOAD_CONCURRENCY && queue.length > 0) {
        const item = queue.shift()!
        active += 1
        const img = new Image()
        const finish = () => {
          active -= 1
          pump()
        }
        img.onload = () => {
          markClassicTileArtReady(item.url)
          void img.decode?.().catch(() => undefined).finally(finish)
        }
        img.onerror = () => {
          if (item.attempts + 1 < PRELOAD_RETRY_LIMIT) {
            queue.push({ url: item.url, attempts: item.attempts + 1 })
          }
          finish()
        }
        img.src = item.url
      }
    }

    pump()
  }

  if (options?.immediate) {
    run()
    return
  }

  // Let the main bundle, CSS, fonts, and rank worker claim connections first.
  const start = () => run()
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2500 })
  } else {
    window.setTimeout(start, 600)
  }
}

/** SVG URL for the Illustrative Classic tile set, or null when no art exists (e.g. blank). */
export function classicTileArtUrl(def: TileDef): string | null {
  switch (def.cat) {
    case 'suit':
      return classicTileUrlByStem.get(`${def.suit}_${def.rank}`) ?? null
    case 'wind':
      return classicTileUrlByStem.get(WIND_STEM[def.wind]) ?? null
    case 'dragon': {
      if (def.dragon === 'any') {
        return classicTileUrlByStem.get('dragon_red') ?? null
      }
      const stem = `dragon_${def.dragon}`
      return classicTileUrlByStem.get(stem) ?? null
    }
    case 'flower':
      return (
        classicTileUrlByStem.get(`flower_${def.flower}`) ??
        classicTileUrlByStem.get('flower_1') ??
        null
      )
    case 'joker':
      return classicTileUrlByStem.get('joker') ?? null
    case 'blank':
      return null
  }
}
