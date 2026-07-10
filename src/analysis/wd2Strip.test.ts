import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlotRowsWithVariants,
  greedyPatternMatchDetail,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function defLabel(def: TileDef): string {
  if (def.cat === 'suit') return `${def.rank}${def.suit[0]!.toUpperCase()}`
  if (def.cat === 'dragon') return `${def.dragon[0]!.toUpperCase()}D`
  if (def.cat === 'wind') return def.wind
  if (def.cat === 'joker') return 'J'
  return def.cat
}

/** Rack from a W&D #2 screenshot: 13 concealed tiles (new draw kept separate on the rack UI). */
function wd2ScreenshotRack13(): TileInstance[] {
  return [
    tile({ cat: 'suit', suit: 'dot', rank: 6 }, '1'),
    tile({ cat: 'suit', suit: 'dot', rank: 2 }, '2'),
    tile({ cat: 'wind', wind: 'S' }, '3'),
    tile({ cat: 'dragon', dragon: 'green' }, '4'),
    tile({ cat: 'dragon', dragon: 'green' }, '5'),
    tile({ cat: 'dragon', dragon: 'red' }, '6'),
    tile({ cat: 'dragon', dragon: 'soap' }, '7'),
    tile({ cat: 'suit', suit: 'bam', rank: 5 }, '8'),
    tile({ cat: 'suit', suit: 'crak', rank: 5 }, '9'),
    tile({ cat: 'suit', suit: 'dot', rank: 2 }, '10'),
    tile({ cat: 'joker' }, '11'),
    tile({ cat: 'wind', wind: 'W' }, '12'),
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, '13'),
  ]
}

describe('W&D #2 suggested strip', () => {
  it('groups dragons by meld (3+3+4) in card line order', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.title.includes('1234 DDD DDD DDDD'))
    expect(p).toBeDefined()

    const rack = wd2ScreenshotRack13()
    const detail = greedyPatternMatchDetail(rack, p!)
    const { rows } = buildSuggestedStripSlotRowsWithVariants(
      p!,
      rack,
      detail.usedOrder,
      new Set(),
      detail.usedMeta,
    )
    const labels = rows[0]!.map((s) => defLabel(s.displayDef))
    expect(labels).toHaveLength(14)
    expect(labels.slice(0, 4)).toEqual(['4D', '5D', '6D', '7D'])

    const dragonLabels = labels.slice(4)
    expect(dragonLabels.slice(0, 3).every((l) => l === dragonLabels[0])).toBe(true)
    expect(dragonLabels.slice(3, 6).every((l) => l === dragonLabels[3])).toBe(true)
    expect(dragonLabels.slice(6, 10).every((l) => l === dragonLabels[6])).toBe(true)
    expect(new Set([dragonLabels[0], dragonLabels[3], dragonLabels[6]]).size).toBe(3)
  })
})
