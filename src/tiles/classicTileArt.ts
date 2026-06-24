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

let tileArtPreloadStarted = false

/**
 * Fetch + decode every Illustrative Classic tile SVG up front (called during the launch splash) so
 * the first time a tile appears it paints synchronously from the WebView cache instead of flashing a
 * blank face while the file is fetched/decoded — the main cause of tile "pop-in" inside Capacitor.
 */
export function preloadClassicTileArt(): void {
  if (tileArtPreloadStarted || typeof Image === 'undefined') return
  tileArtPreloadStarted = true
  for (const url of ALL_CLASSIC_TILE_ART_URLS) {
    const img = new Image()
    img.src = url
    // decode() moves the decode off the first render path so later paints are instant.
    img.decode?.().catch(() => undefined)
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
