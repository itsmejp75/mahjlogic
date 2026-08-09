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

/** Keep mobile Safari’s ~6-connection pool free for JS chunks + the suggested-hands worker. */
const PRELOAD_CONCURRENCY = 2
const PRELOAD_RETRY_LIMIT = 2

type PreloadOptions = {
  /**
   * Native Capacitor splash / Play boot can afford an immediate warm. Cold web boot may wait —
   * flooding ~45 SVGs at module load starves JS chunks and the rank worker (empty Logic panel +
   * broken tile faces).
   */
  immediate?: boolean
  /** Which illustrative pack to warm; defaults to Classic (boot path). */
  graphics?: IllustrativeTileGraphics
}

type PreloadEntry = {
  promise: Promise<void>
  resolve: () => void
  /** Pump has started (idle wait cancelled or never scheduled). */
  pumping: boolean
  idleHandle: number | null
  idleIsRic: boolean
}

const tileArtPreloadBySet = new Map<IllustrativeTileGraphics, PreloadEntry>()

function cancelIdle(entry: PreloadEntry) {
  if (entry.idleHandle == null) return
  if (entry.idleIsRic && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(entry.idleHandle)
  } else {
    window.clearTimeout(entry.idleHandle)
  }
  entry.idleHandle = null
}

function runTileArtPump(graphics: IllustrativeTileGraphics, entry: PreloadEntry) {
  if (entry.pumping) return
  entry.pumping = true
  cancelIdle(entry)

  const urls = allUrlsForSet(graphics)
  if (urls.length === 0) {
    entry.resolve()
    return
  }

  const queue = urls.map((url) => ({ url, attempts: 0 }))
  let active = 0
  let settled = false

  const settle = () => {
    if (settled) return
    settled = true
    entry.resolve()
  }

  const pump = () => {
    while (active < PRELOAD_CONCURRENCY && queue.length > 0) {
      const item = queue.shift()!
      active += 1
      const img = new Image()
      const finish = () => {
        active -= 1
        if (queue.length === 0 && active === 0) settle()
        else pump()
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
    if (queue.length === 0 && active === 0) settle()
  }

  pump()
}

/**
 * Fetch + decode illustrative tile SVGs with a small concurrency cap.
 * Resolves when the pack is warm (or empty). A later `{ immediate: true }` call upgrades a
 * pending idle schedule so Play boot does not wait on requestIdleCallback.
 */
export function preloadClassicTileArtAsync(options?: PreloadOptions): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve()
  const graphics = options?.graphics ?? 'illustrative-classic'

  let entry = tileArtPreloadBySet.get(graphics)
  if (!entry) {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    entry = {
      promise,
      resolve,
      pumping: false,
      idleHandle: null,
      idleIsRic: false,
    }
    tileArtPreloadBySet.set(graphics, entry)
  }

  if (entry.pumping) return entry.promise

  if (options?.immediate) {
    runTileArtPump(graphics, entry)
    return entry.promise
  }

  if (entry.idleHandle == null) {
    const start = () => runTileArtPump(graphics, entry!)
    if (typeof window.requestIdleCallback === 'function') {
      entry.idleIsRic = true
      entry.idleHandle = window.requestIdleCallback(start, { timeout: 2500 })
    } else {
      entry.idleIsRic = false
      entry.idleHandle = window.setTimeout(start, 600)
    }
  }

  return entry.promise
}

/**
 * Fetch + decode illustrative tile SVGs with a small concurrency cap.
 * Called after first paint (web) or during splash / Play boot (immediate) so the first rack
 * paint can hit cache without blocking boot.
 */
export function preloadClassicTileArt(options?: PreloadOptions): void {
  void preloadClassicTileArtAsync(options)
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
