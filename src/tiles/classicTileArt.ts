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

/** SVG URL for the Illustrative Classic tile set, or null when no art exists (e.g. blank). */
export function classicTileArtUrl(def: TileDef, alternateDragons: boolean): string | null {
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
      if (alternateDragons && (def.dragon === 'red' || def.dragon === 'green')) {
        return classicTileUrlByStem.get(`${stem}_alternate`) ?? classicTileUrlByStem.get(stem) ?? null
      }
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
