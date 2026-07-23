import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
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
  if (def.cat === 'joker') return 'J'
  if (def.cat === 'flower') return 'F'
  return def.cat
}

/**
 * Screenshot repro: Runs #7b focused, exposed 8-dot kong (with joker), concealed rack mixed
 * with four 9-bams lit. Claim-meld strip realign used to remap 789 → 678, leaving the 9s
 * highlighted but unsorted on the right of the rack.
 */
describe('Runs #7b exposed kong sort + strip', () => {
  const p = NMJL_2026_PATTERNS.find(
    (x) => x.cardHandCode === '7b' && x.section === 'CONSECUTIVE RUN',
  )!

  const exposureTiles: TileInstance[] = [
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8a'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8b'),
    tile({ cat: 'joker' }, 'j1'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8c'),
  ]

  const hand: TileInstance[] = [
    tile({ cat: 'flower', flower: 1 }, 'f1'),
    tile({ cat: 'flower', flower: 2 }, 'f2'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7'),
    tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9a'),
    tile({ cat: 'suit', suit: 'crak', rank: 3 }, 'c3'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9b'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9c'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9d'),
  ]

  const exposure = { tiles: exposureTiles }
  const rack = [...hand, ...exposureTiles]
  const exposureTileIds = new Set(exposureTiles.map((t) => t.id))

  it('keeps strip on 789 (does not remap exposed 8888 onto 678)', () => {
    const detail = greedyPatternMatchDetail(rack, p, { exposureTileIds })
    const bestIds = computeRackPatternHighlightIds(rack, p, detail, exposureTileIds)
    const slots = buildSuggestedStripSlots(
      p,
      rack,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureTileIds,
      [exposure],
    )
    expect(slots.map((s) => defLabel(s.displayDef)).join(' ')).toBe(
      'F F 7C 7C 7C 7C 8D 8D 8D 8D 9B 9B 9B 9B',
    )
    const concealedStripIds = slots
      .map((s) => s.tileId)
      .filter((id): id is string => id != null && hand.some((t) => t.id === id))
    expect(concealedStripIds.map((id) => defLabel(hand.find((t) => t.id === id)!.def))).toEqual([
      'F',
      'F',
      '7C',
      '9B',
      '9B',
      '9B',
      '9B',
    ])
  })

  it('Sort pulls every highlighted concealed tile left of dim leftovers', () => {
    const input: RankSuggestedHandsInput = {
      hand,
      wallRemaining: 59,
      discards: [],
      exposures: [],
      playerClaimMelds: [exposure],
      eastTableClaimMelds: [exposure],
      patterns: NMJL_2026_PATTERNS,
    }
    const detail = greedyPatternMatchDetail(rack, p, { exposureTileIds })
    const bestIds = computeRackPatternHighlightIds(rack, p, detail, exposureTileIds)
    const sorted = sortHandForSuggestedPattern(hand, p.id, input)

    expect(sorted.map((t) => defLabel(t.def)).join(' ')).toBe('F F 7C 9B 9B 9B 9B 6B 3C')

    const concealedBestIds = [...bestIds].filter((id) => hand.some((t) => t.id === id))
    const firstNonBest = sorted.findIndex((t) => !bestIds.has(t.id))
    const bestPrefix = firstNonBest < 0 ? sorted : sorted.slice(0, firstNonBest)
    expect(bestPrefix.map((t) => t.id).sort()).toEqual([...concealedBestIds].sort())
  })
})
