import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlotRowsWithVariants,
  greedyPatternMatchDetail,
  sortHandForSuggestedPattern,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'
import type { RankSuggestedHandsInput } from './suggestedHands'

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

  it('puts jokers in the green pung and keeps soap at the end (G, J, J, Soap)', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.title.includes('1234 DDD DDD DDDD'))
    expect(p).toBeDefined()

    // 6–9 Bam + 1 green + 1 soap + 2 jokers (leftovers omitted — not needed for strip/sort).
    const hand = [
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6'),
      tile({ cat: 'suit', suit: 'bam', rank: 7 }, 'b7'),
      tile({ cat: 'suit', suit: 'bam', rank: 8 }, 'b8'),
      tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9'),
      tile({ cat: 'dragon', dragon: 'green' }, 'g1'),
      tile({ cat: 'dragon', dragon: 'soap' }, 's1'),
      tile({ cat: 'joker' }, 'j1'),
      tile({ cat: 'joker' }, 'j2'),
    ]
    const detail = greedyPatternMatchDetail(hand, p!)
    const bestIds = new Set(detail.usedOrder)
    const { rows } = buildSuggestedStripSlotRowsWithVariants(
      p!,
      hand,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
    )
    const dragonSlots = rows[0]!.slice(4)
    const greenRun = dragonSlots.slice(0, 3)
    expect(greenRun[0]).toMatchObject({
      displayDef: { cat: 'dragon', dragon: 'green' },
      highlight: true,
      jokerSuggested: false,
    })
    expect(greenRun.filter((s) => s.jokerSuggested)).toHaveLength(2)
    expect(greenRun.every((s) => s.displayDef.cat === 'dragon' && s.displayDef.dragon === 'green')).toBe(
      true,
    )

    const soapRun = dragonSlots.slice(6, 10)
    expect(soapRun[0]).toMatchObject({
      displayDef: { cat: 'dragon', dragon: 'soap' },
      highlight: true,
      jokerSuggested: false,
    })
    expect(soapRun.slice(1).every((s) => !s.highlight && !s.jokerSuggested)).toBe(true)

    // Sort must follow the tray strip's left-to-right tileIds (G, J, J, Soap — not G, Soap, J, J).
    const stripTileIds = rows[0]!.map((s) => s.tileId).filter((id): id is string => id != null)
    expect(stripTileIds.slice(0, 8).map((id) => defLabel(hand.find((t) => t.id === id)!.def))).toEqual([
      '6B',
      '7B',
      '8B',
      '9B',
      'GD',
      'J',
      'J',
      'SD',
    ])

    const input = {
      hand,
      wallRemaining: 40,
      discards: [],
      exposures: [[], [], []],
      patterns: NMJL_2026_PATTERNS,
    } satisfies RankSuggestedHandsInput
    const sorted = sortHandForSuggestedPattern(hand, p!.id, input)
    expect(sorted.slice(0, 8).map((t) => t.id)).toEqual(stripTileIds.slice(0, 8))
    expect(sorted.slice(0, 8).map((t) => defLabel(t.def))).toEqual([
      '6B',
      '7B',
      '8B',
      '9B',
      'GD',
      'J',
      'J',
      'SD',
    ])
  })
})
