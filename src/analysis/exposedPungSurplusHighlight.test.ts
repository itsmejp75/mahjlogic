import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { tileInstancesWithClaimMeldJokersResolved } from './eastExposurePatternFit'
import {
  computeRackPatternHighlightIds,
  computeSuggestedDiscardTrackerNeedDefs,
  greedyPatternMatchDetail,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function fullKey(def: TileDef): string {
  if (def.cat === 'suit') return `s:${def.suit}:${def.rank}`
  if (def.cat === 'dragon') return `d:${def.dragon}`
  if (def.cat === 'wind') return `w:${def.wind}`
  if (def.cat === 'flower') return 'f'
  return def.cat
}

/**
 * Screenshot repro: Runs #4a focused, exposed 7-dot pung, then a 4th 7-dot drawn into the tray.
 * Greedy fill used to park the pung on the kong slot (base 4 → 444 555 6666 7777) and light the
 * surplus concealed 7 — even though the discard tracker correctly left DOT 7 unlit.
 */
describe('exposed pung surplus tile stays unlit for Runs #4a', () => {
  const p = NMJL_2026_PATTERNS.find(
    (x) => x.cardHandCode === '4a' && x.title.includes('111 222 3333 4444'),
  )!

  const exposureTiles: TileInstance[] = [
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'e7a'),
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'e7b'),
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'e7c'),
  ]
  const melds = [{ tiles: exposureTiles }]
  const exposureIds = new Set(exposureTiles.map((t) => t.id))

  const hand: TileInstance[] = [
    tile({ cat: 'suit', suit: 'dot', rank: 6 }, 'h6a'),
    tile({ cat: 'suit', suit: 'dot', rank: 6 }, 'h6b'),
    tile({ cat: 'joker' }, 'hj'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'h8a'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'h8b'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'h9'),
    tile({ cat: 'suit', suit: 'crak', rank: 8 }, 'hc8a'),
    tile({ cat: 'suit', suit: 'crak', rank: 8 }, 'hc8b'),
    tile({ cat: 'suit', suit: 'crak', rank: 9 }, 'hc9'),
    tile({ cat: 'suit', suit: 'bam', rank: 7 }, 'hb7'),
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'h7'),
  ]

  // Match App: exposures sorted to the front so left-to-right take prefers committed tiles.
  const rackMatch = [
    ...exposureTiles,
    ...tileInstancesWithClaimMeldJokersResolved(hand, melds).filter((t) => !exposureIds.has(t.id)),
  ]
  const greedyOpts = { exposureTileIds: exposureIds, claimMelds: melds }

  it('does not light the concealed 4th 7-dot on the rack', () => {
    // Without claim-meld exact-size preference, greedy still parks the pung on the kong and
    // consumes the surplus concealed 7 even when exposures are sorted first.
    const legacy = greedyPatternMatchDetail(rackMatch, p, { exposureTileIds: exposureIds })
    expect(legacy.usedOrder.includes('h7')).toBe(true)

    const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
    const bestIds = computeRackPatternHighlightIds(rackMatch, p, detail, exposureIds)
    expect(detail.usedOrder.includes('h7')).toBe(false)
    expect(bestIds.has('h7')).toBe(false)
    // Exposure copies stay lit — they fill the pung.
    expect(bestIds.has('e7a')).toBe(true)
  })

  it('discard tracker does not mark 7-dot as still needed', () => {
    const needDefs = computeSuggestedDiscardTrackerNeedDefs(
      p.id,
      rackMatch,
      exposureIds,
      NMJL_2026_PATTERNS,
      melds,
    )
    expect(needDefs.some((d) => fullKey(d) === 's:dot:7')).toBe(false)
  })
})
