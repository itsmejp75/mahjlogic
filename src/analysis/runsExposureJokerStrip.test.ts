import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
} from './suggestedHands'
import { tileInstancesWithClaimMeldJokersResolved } from './eastExposurePatternFit'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

describe('Runs #4b exposure joker strip highlights', () => {
  it('does not light a third 3C when the only joker is committed to an exposed 5B kong', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.cardHandCode === '4b' && x.section?.includes('RUN'))!
    const hand: TileInstance[] = [
      tile({ cat: 'suit', suit: 'crak', rank: 3 }, 'c3a'),
      tile({ cat: 'suit', suit: 'crak', rank: 3 }, 'c3b'),
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c4a'),
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c4b'),
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6a'),
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6b'),
      tile({ cat: 'flower' }, 'f1'),
      tile({ cat: 'suit', suit: 'crak', rank: 2 }, 'c2'),
      tile({ cat: 'suit', suit: 'crak', rank: 8 }, 'c8'),
      tile({ cat: 'suit', suit: 'bam', rank: 1 }, 'b1'),
    ]
    const e5a = tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'e5a')
    const e5b = tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'e5b')
    const e5c = tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'e5c')
    const eJ = tile({ cat: 'joker' }, 'eJ')
    const melds = [{ tiles: [e5a, e5b, e5c, eJ] }]
    const exposureIds = new Set(melds.flatMap((m) => m.tiles.map((t) => t.id)))
    const rackDisplay = [...hand, ...melds.flatMap((m) => m.tiles)]
    const rackMatch = tileInstancesWithClaimMeldJokersResolved(hand, melds)
    const greedyOpts = { exposureTileIds: exposureIds }
    const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
    const bestIds = computeRackPatternHighlightIds(rackMatch, p, detail, exposureIds)
    const slots = buildSuggestedStripSlots(
      p,
      rackDisplay,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureIds,
      melds,
    )

    const lit = (rank: number, suit: 'crak' | 'bam') =>
      slots.filter(
        (s) =>
          s.displayDef.cat === 'suit' &&
          s.displayDef.suit === suit &&
          s.displayDef.rank === rank &&
          s.highlight,
      )

    expect(lit(3, 'crak')).toHaveLength(2)
    expect(lit(4, 'crak')).toHaveLength(2)
    expect(lit(5, 'bam')).toHaveLength(4)
    expect(lit(6, 'bam')).toHaveLength(2)

    const jokerSlot = slots.find((s) => s.tileId === 'eJ')
    expect(jokerSlot?.highlight).toBe(true)
    expect(jokerSlot?.displayDef).toEqual({ cat: 'suit', suit: 'bam', rank: 5 })
  })
})
