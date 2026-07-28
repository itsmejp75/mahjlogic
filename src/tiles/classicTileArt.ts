import type { TileDef } from '../mahjong/types'
import type { IllustrativeTileGraphics } from './tileGraphics'

const classicTileModules = import.meta.glob<string>('../assets/tiles/classic/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const largeClassicTileModules = import.meta.glob<string>('../assets/tiles/large classic/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

function stemFromPath(path: string): string {
  const match = path.match(/\/([^/]+)\.svg$/)
  return match?.[1] ?? ''
}

function urlByStemFromModules(modules: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [path, url] of Object.entries(modules)) {
    map.set(stemFromPath(path), url)
  }
  return map
}

const classicTileUrlByStem = urlByStemFromModules(classicTileModules)
const largeClassicTileUrlByStem = urlByStemFromModules(largeClassicTileModules)

const TILE_URL_BY_STEM: Record<IllustrativeTileGraphics, Map<string, string>> = {
  'illustrative-classic': classicTileUrlByStem,
  'illustrative-large': largeClassicTileUrlByStem,
}

const WIND_STEM: Record<'E' | 'S' | 'W' | 'N', string> = {
  E: 'wind_east',
  S: 'wind_south',
  W: 'wind_west',
  N: 'wind_north',
}

function allUrlsForSet(set: IllustrativeTileGraphics): readonly string[] {
  return Array.from(new Set(TILE_URL_BY_STEM[set].values()))
}

/** Every distinct Illustrative Classic tile-art URL (deduped across stems). */
export const ALL_CLASSIC_TILE_ART_URLS: readonly string[] = allUrlsForSet('illustrative-classic')

/** Every distinct Large Classic tile-art URL (deduped across stems). */
export const ALL_LARGE_CLASSIC_TILE_ART_URLS: readonly string[] = allUrlsForSet('illustrative-large')

/** URLs that have successfully loaded/decoded at least once in this session. */
const classicTileArtReady = new Set<string>()

export function isClassicTileArtReady(url: string): boolean {
  return classicTileArtReady.has(url)
}

export function markClassicTileArtReady(url: string): void {
  classicTileArtReady.add(url)
}

const tileArtPreloadStarted = new Set<IllustrativeTileGraphics>()

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
  /** Which illustrative pack to warm; defaults to Classic (boot path). */
  graphics?: IllustrativeTileGraphics
}

/**
 * Fetch + decode illustrative tile SVGs with a small concurrency cap.
 * Called after first paint (web) or during splash (native) so the first rack paint can hit cache
 * without blocking boot.
 */
export function preloadClassicTileArt(options?: PreloadOptions): void {
  if (typeof Image === 'undefined') return
  const graphics = options?.graphics ?? 'illustrative-classic'
  if (tileArtPreloadStarted.has(graphics)) return
  tileArtPreloadStarted.add(graphics)

  const urls = allUrlsForSet(graphics)
  if (urls.length === 0) return

  const run = () => {
    const queue = urls.map((url) => ({ url, attempts: 0 }))
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

function tileArtUrlFromStemMap(urlByStem: Map<string, string>, def: TileDef): string | null {
  switch (def.cat) {
    case 'suit':
      return urlByStem.get(`${def.suit}_${def.rank}`) ?? null
    case 'wind':
      return urlByStem.get(WIND_STEM[def.wind]) ?? null
    case 'dragon': {
      if (def.dragon === 'any') {
        return urlByStem.get('dragon_red') ?? null
      }
      const stem = `dragon_${def.dragon}`
      return urlByStem.get(stem) ?? null
    }
    case 'flower':
      return urlByStem.get(`flower_${def.flower}`) ?? urlByStem.get('flower_1') ?? null
    case 'joker':
      return urlByStem.get('joker') ?? null
    case 'blank':
      return null
  }
}

/** SVG URL for the Illustrative Classic tile set, or null when no art exists (e.g. blank). */
export function classicTileArtUrl(def: TileDef): string | null {
  return tileArtUrlFromStemMap(classicTileUrlByStem, def)
}

/** SVG URL for the Large Classic tile set, or null when no art exists (e.g. blank). */
export function largeClassicTileArtUrl(def: TileDef): string | null {
  return tileArtUrlFromStemMap(largeClassicTileUrlByStem, def)
}

/** SVG URL for the active illustrative pack, or null when no art exists (e.g. blank). */
export function illustrativeTileArtUrl(
  graphics: IllustrativeTileGraphics,
  def: TileDef,
): string | null {
  return tileArtUrlFromStemMap(TILE_URL_BY_STEM[graphics], def)
}
